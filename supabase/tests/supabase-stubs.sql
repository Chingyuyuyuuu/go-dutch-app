-- Minimal stand-ins for what Supabase provides, so the migrations can be tested in PGlite
-- (plain Postgres, no Docker). Not deployed.
create schema auth;
create table auth.users (id uuid primary key, email text);

-- Supabase reads the signed-in user from the request JWT. Tests set request.jwt.claim.sub.
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create role anon nologin;
create role authenticated nologin;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create publication supabase_realtime;
