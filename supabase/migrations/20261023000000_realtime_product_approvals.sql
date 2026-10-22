-- Product submissions and review decisions should reach connected admin and
-- seller dashboards without a manual refresh. RLS still determines which
-- product rows each authenticated client may receive.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
exception
  when undefined_object then
    raise exception 'The supabase_realtime publication is unavailable. Enable Realtime for public.products in the Supabase dashboard.';
end;
$$;
