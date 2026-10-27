-- A later Google login refreshes email and avatar, but must not overwrite a
-- display name explicitly chosen in the VERS profile.
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

  insert into public.app_users as existing (
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
      display_name = coalesce(
        nullif(trim(existing.nickname), ''),
        nullif(
          trim(concat_ws(' ', existing.first_name, existing.last_name)),
          ''
        ),
        excluded.display_name
      ),
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
  where membership.user_id = current_uid_value
    and public.is_campaign_member(membership.campaign_id);
end;
$$;

-- Synchronize cached roles without removing characters or membership data.
create function public.sync_campaign_access_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.campaign_members membership
  set role = new.role, character_name = new.character_name
  from public.app_users profile
  where membership.user_id = profile.firebase_uid
    and membership.campaign_id = new.campaign_id
    and lower(trim(profile.email)) = new.email and new.enabled;
  return new;
end;
$$;
revoke all on function public.sync_campaign_access_role() from public, anon, authenticated;
create trigger campaign_access_sync_role after insert or update on public.campaign_access_grants
for each row execute function public.sync_campaign_access_role();
