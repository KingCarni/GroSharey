-- Supabase grants these by default. Applied after the migrations so the RLS assertions can
-- run as the `authenticated` role the way PostgREST would.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
