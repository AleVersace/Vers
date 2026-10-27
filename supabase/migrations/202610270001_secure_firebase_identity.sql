-- Trust is installation-specific and must not come from a caller-controlled
-- claim or session setting. Configure this once with the server-only setup RPC.
create schema if not exists vers_private;
revoke all on schema vers_private from public, anon, authenticated;

create table if not exists vers_private.installation_settings (
  singleton boolean primary key default true check (singleton),
  firebase_project_id text not null check (
    firebase_project_id ~ '^[a-z][a-z0-9-]{4,28}[a-z0-9]$'
  )
);
alter table vers_private.installation_settings enable row level security;
revoke all on vers_private.installation_settings from public, anon, authenticated;

create function public.configure_firebase_auth(project_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into vers_private.installation_settings (singleton, firebase_project_id)
  values (true, project_id)
  on conflict (singleton) do update
  set firebase_project_id = excluded.firebase_project_id;
end;
$$;
revoke all on function public.configure_firebase_auth(text)
  from public, anon, authenticated;
grant execute on function public.configure_firebase_auth(text) to service_role;

create or replace function public.current_firebase_uid()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(auth.jwt()->>'sub', '')
  from vers_private.installation_settings config
  where config.singleton
    and auth.jwt()->>'iss' = 'https://securetoken.google.com/' || config.firebase_project_id
    and auth.jwt()->>'aud' = config.firebase_project_id
    and auth.jwt()->>'email_verified' = 'true'
    and auth.jwt()->'firebase'->>'sign_in_provider' = 'google.com'
    and auth.jwt()->>'role' = 'authenticated';
$$;
revoke all on function public.current_firebase_uid() from public, anon;
grant execute on function public.current_firebase_uid() to authenticated, service_role;
