-- New orders and fulfillment updates should reach the owning seller without
-- a refresh. Row-level security continues to isolate each seller's orders.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'seller_orders'
  ) then
    alter publication supabase_realtime add table public.seller_orders;
  end if;
exception
  when undefined_object then
    raise exception 'The supabase_realtime publication is unavailable. Enable Realtime for public.seller_orders in the Supabase dashboard.';
end;
$$;
