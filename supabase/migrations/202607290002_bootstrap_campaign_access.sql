create table public.campaign_access_grants (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role public.campaign_role not null default 'player',
  character_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, email),
  check (email = lower(trim(email)))
);

create unique index campaign_access_grants_email_idx
  on public.campaign_access_grants(campaign_id, lower(email));

create trigger campaign_access_grants_set_updated_at
before update on public.campaign_access_grants
for each row execute function public.set_updated_at();

alter table public.campaign_access_grants enable row level security;

create function public.bootstrap_current_user()
returns table (
  campaign_id uuid,
  role public.campaign_role,
  character_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  firebase_uid text := public.current_firebase_uid();
  firebase_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  firebase_name text := nullif(trim(coalesce(auth.jwt()->>'name', '')), '');
  firebase_avatar text := nullif(trim(coalesce(auth.jwt()->>'picture', '')), '');
begin
  if firebase_uid is null or firebase_email = '' then
    raise exception 'Firebase identity is incomplete'
      using errcode = '42501';
  end if;

  insert into public.app_users (
    firebase_uid,
    email,
    display_name,
    avatar_url
  )
  values (
    firebase_uid,
    firebase_email,
    coalesce(firebase_name, split_part(firebase_email, '@', 1)),
    firebase_avatar
  )
  on conflict (firebase_uid) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url;

  insert into public.campaign_members (
    campaign_id,
    user_id,
    role,
    character_name
  )
  select
    access.campaign_id,
    firebase_uid,
    access.role,
    access.character_name
  from public.campaign_access_grants access
  where access.enabled
    and lower(access.email) = firebase_email
  on conflict (campaign_id, user_id) do update
  set role = excluded.role,
      character_name = excluded.character_name;

  return query
  select
    membership.campaign_id,
    membership.role,
    membership.character_name
  from public.campaign_members membership
  where membership.user_id = firebase_uid;
end;
$$;

revoke all on function public.bootstrap_current_user() from public;
grant execute on function public.bootstrap_current_user() to authenticated;

-- Installation data is created explicitly by the server-only setup command.
