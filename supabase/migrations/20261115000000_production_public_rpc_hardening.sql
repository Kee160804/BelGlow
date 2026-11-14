-- Keep public endpoints behind the Next.js API layer so validation and limits
-- cannot be bypassed by calling Supabase RPCs directly with the publishable key.
create index if not exists public_api_rate_limits_window_started_idx
  on public.public_api_rate_limits(window_started_at);

create or replace function public.consume_public_rate_limit(
  rate_bucket text,
  rate_subject_hash text,
  rate_max_requests integer,
  rate_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if rate_bucket is null
    or rate_subject_hash is null
    or rate_max_requests is null
    or rate_window_seconds is null
    or rate_bucket not in ('checkout', 'checkout_email', 'order_tracking', 'payment_lookup', 'payment_receipt', 'support')
    or rate_subject_hash !~ '^[a-f0-9]{32,64}$'
    or rate_max_requests not between 1 and 100
    or rate_window_seconds not between 10 and 86400 then
    return false;
  end if;

  -- Opportunistically trim old subjects so the rate-limit table stays bounded.
  if mod(abs(hashtextextended(rate_subject_hash, 0)), 100) = 0 then
    delete from public.public_api_rate_limits
    where window_started_at < now() - interval '48 hours';
  end if;

  insert into public.public_api_rate_limits(bucket, subject_hash, window_started_at, request_count)
  values (rate_bucket, rate_subject_hash, now(), 1)
  on conflict (bucket, subject_hash) do update set
    window_started_at = case
      when public.public_api_rate_limits.window_started_at <= now() - make_interval(secs => rate_window_seconds) then now()
      else public.public_api_rate_limits.window_started_at
    end,
    request_count = case
      when public.public_api_rate_limits.window_started_at <= now() - make_interval(secs => rate_window_seconds) then 1
      else public.public_api_rate_limits.request_count + 1
    end
  returning request_count <= rate_max_requests into allowed;

  return coalesce(allowed, false);
end;
$$;
revoke execute on function public.consume_public_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer) to service_role;

revoke execute on function public.track_guest_order(bigint, text) from public, anon, authenticated;
grant execute on function public.track_guest_order(bigint, text) to service_role;

revoke execute on function public.get_order_payment_details(bigint, text) from public, anon, authenticated;
grant execute on function public.get_order_payment_details(bigint, text) to service_role;

revoke execute on function public.submit_support_request(text, text, text, text, text, text, text) from public, anon, authenticated;
create or replace function public.submit_support_request(
  request_user_id uuid,
  request_type text,
  request_topic text,
  request_name text,
  request_email text,
  request_order_number text,
  request_subject text,
  request_message text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  if request_type not in ('shopper', 'seller', 'visitor') or request_topic not in ('order', 'account', 'product', 'seller', 'payment', 'other') then
    raise exception 'Invalid support request category';
  end if;
  if char_length(trim(request_name)) not between 2 and 100
    or char_length(trim(request_email)) not between 3 and 254
    or trim(request_email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid support contact';
  end if;
  if char_length(trim(request_subject)) not between 4 and 140 or char_length(trim(request_message)) not between 20 and 4000 then
    raise exception 'Invalid support request details';
  end if;

  insert into public.support_requests (
    user_id, requester_type, topic, requester_name, requester_email, order_number, subject, message
  ) values (
    request_user_id, request_type, request_topic, request_name, lower(trim(request_email)),
    nullif(left(trim(coalesce(request_order_number, '')), 40), ''), trim(request_subject), trim(request_message)
  ) returning id into created_id;

  return created_id;
end;
$$;
revoke execute on function public.submit_support_request(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_support_request(uuid, text, text, text, text, text, text, text) to service_role;

-- The order RPC remains available for anonymous and authenticated checkout.
-- Enforce a second, database-side cap keyed to normalized email so direct RPC
-- callers still encounter an order limit even if they skip the web endpoint.
create or replace function public.enforce_checkout_email_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() in ('anon', 'authenticated')
    and not public.consume_public_rate_limit(
      'checkout_email',
      md5(lower(trim(new.email))),
      10,
      3600
    ) then
    raise exception 'Too many checkout attempts for this email. Please wait before trying again.';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_checkout_email_rate_limit() from public, anon, authenticated;
drop trigger if exists enforce_checkout_email_rate_limit on public.orders;
create trigger enforce_checkout_email_rate_limit
  before insert on public.orders
  for each row execute function public.enforce_checkout_email_rate_limit();
