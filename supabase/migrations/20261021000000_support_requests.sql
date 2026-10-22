-- Public contact requests are inserted only through a validated security-definer
-- function. The underlying table remains readable and manageable by admins only.
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  requester_type text not null check (requester_type in ('shopper', 'seller', 'visitor')),
  topic text not null check (topic in ('order', 'account', 'product', 'seller', 'payment', 'other')),
  requester_name text not null check (char_length(requester_name) between 2 and 100),
  requester_email text not null check (char_length(requester_email) between 3 and 254),
  order_number text,
  subject text not null check (char_length(subject) between 4 and 140),
  message text not null check (char_length(message) between 20 and 4000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'closed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_status_created_idx on public.support_requests(status, created_at desc);
alter table public.support_requests enable row level security;

create trigger support_requests_updated_at before update on public.support_requests
  for each row execute procedure public.set_updated_at();

create policy "admins can view support requests" on public.support_requests
  for select to authenticated using (public.is_admin());
create policy "admins can update support requests" on public.support_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.support_requests from anon, authenticated;
grant select, update on public.support_requests to authenticated;

create or replace function public.submit_support_request(
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
    auth.uid(), request_type, request_topic, left(trim(request_name), 100), lower(left(trim(request_email), 254)),
    nullif(left(trim(coalesce(request_order_number, '')), 40), ''), left(trim(request_subject), 140), left(trim(request_message), 4000)
  ) returning id into created_id;

  return created_id;
end;
$$;

revoke execute on function public.submit_support_request(text, text, text, text, text, text, text) from public;
grant execute on function public.submit_support_request(text, text, text, text, text, text, text) to anon, authenticated;
