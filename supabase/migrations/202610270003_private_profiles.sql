-- Keep account fields private. Share only a deliberately small projection.
-- Full profile SELECT is restricted in 007 after the compatible client deploy.

revoke insert, update on public.app_users from authenticated;
grant update (display_name, first_name, last_name, nickname, table_layout)
  on public.app_users to authenticated;

create table public.tabletop_profiles (
  user_id text primary key references public.app_users(firebase_uid) on delete cascade,
  display_name text not null,
  avatar_url text
);
insert into public.tabletop_profiles (user_id, display_name, avatar_url)
select firebase_uid, display_name, avatar_url from public.app_users;

create function public.sync_tabletop_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tabletop_profiles (user_id, display_name, avatar_url)
  values (new.firebase_uid, new.display_name, new.avatar_url)
  on conflict (user_id) do update
  set display_name = excluded.display_name, avatar_url = excluded.avatar_url;
  return new;
end;
$$;
revoke all on function public.sync_tabletop_profile() from public, anon, authenticated;
create trigger app_users_sync_tabletop_profile
after insert or update of display_name, avatar_url on public.app_users
for each row execute function public.sync_tabletop_profile();

create function public.can_view_tabletop_profile(target_user_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_user_id = public.current_firebase_uid() or exists (
    select 1 from public.campaign_members member
    join public.app_users profile on profile.firebase_uid = member.user_id
    join public.campaign_access_grants access
      on access.campaign_id = member.campaign_id
      and access.email = lower(trim(profile.email)) and access.enabled
    where member.user_id = target_user_id
      and public.is_campaign_member(member.campaign_id)
  );
$$;
revoke all on function public.can_view_tabletop_profile(text) from public, anon;
grant execute on function public.can_view_tabletop_profile(text) to authenticated;
alter table public.tabletop_profiles enable row level security;
create policy "Members can read shared tabletop profiles" on public.tabletop_profiles
for select to authenticated using (public.can_view_tabletop_profile(user_id));
revoke all on public.tabletop_profiles from anon, authenticated;
grant select on public.tabletop_profiles to authenticated;
alter publication supabase_realtime add table public.tabletop_profiles;

create function public.list_campaign_members(target_campaign_id uuid)
returns table (
  campaign_id uuid, user_id text, role public.campaign_role,
  character_name text, app_users jsonb
)
language sql stable security definer set search_path = '' as $$
  select member.campaign_id, member.user_id, access.role, member.character_name,
    jsonb_build_object('display_name', profile.display_name, 'avatar_url', profile.avatar_url)
  from public.campaign_members member
  join public.app_users profile on profile.firebase_uid = member.user_id
  join public.campaign_access_grants access
    on access.campaign_id = member.campaign_id
    and access.email = lower(trim(profile.email)) and access.enabled
  where member.campaign_id = target_campaign_id
    and public.is_campaign_member(target_campaign_id);
$$;
revoke all on function public.list_campaign_members(uuid) from public, anon;
grant execute on function public.list_campaign_members(uuid) to authenticated;
