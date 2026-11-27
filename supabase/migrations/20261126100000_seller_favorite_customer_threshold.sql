alter table public.seller_stores
  add column if not exists favorite_customer_order_threshold integer not null default 5
  check (favorite_customer_order_threshold between 1 and 100);

create or replace function public.save_seller_favorite_customer_threshold(purchase_threshold integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if purchase_threshold is null or purchase_threshold < 1 or purchase_threshold > 100 then
    raise exception 'Favorite customer threshold must be between 1 and 100 purchases';
  end if;

  update public.seller_stores
  set favorite_customer_order_threshold = purchase_threshold,
      updated_at = now()
  where owner_id = auth.uid()
    and status = 'approved';

  if not found then
    raise exception 'Approved seller store not found';
  end if;
end;
$$;

revoke execute on function public.save_seller_favorite_customer_threshold(integer) from public, anon;
grant execute on function public.save_seller_favorite_customer_threshold(integer) to authenticated;
