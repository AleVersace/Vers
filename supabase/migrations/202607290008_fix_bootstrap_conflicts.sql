-- RETURNS TABLE creates PL/pgSQL variables named campaign_id and role. Use
-- constraint names in both UPSERT statements so no output variable can be
-- confused with a conflict-target column.
create or replace function public.bootstrap_current_user()
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
  current_uid_value text := public.current_firebase_uid();
  firebase_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  firebase_name text := nullif(trim(coalesce(auth.jwt()->>'name', '')), '');
  firebase_avatar text := nullif(trim(coalesce(auth.jwt()->>'picture', '')), '');
begin
  if current_uid_value is null or firebase_email = '' then
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
    current_uid_value,
    firebase_email,
    coalesce(firebase_name, split_part(firebase_email, '@', 1)),
    firebase_avatar
  )
  on conflict on constraint app_users_pkey do update
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
    current_uid_value,
    access.role,
    access.character_name
  from public.campaign_access_grants access
  where access.enabled
    and lower(access.email) = firebase_email
  on conflict on constraint campaign_members_pkey do update
  set role = excluded.role,
      character_name = excluded.character_name;

  return query
  select
    membership.campaign_id,
    membership.role,
    membership.character_name
  from public.campaign_members membership
  where membership.user_id = current_uid_value;
end;
$$;
