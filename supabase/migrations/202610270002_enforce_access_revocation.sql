-- Check the active invitation on every request, including existing sessions.
-- The verified JWT email is authoritative; editable profile fields are not.
create or replace function public.is_campaign_member(target_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members membership
    join public.campaign_access_grants access
      on access.campaign_id = membership.campaign_id
      and access.email = lower(trim(auth.jwt()->>'email'))
      and access.enabled
    where membership.campaign_id = target_campaign_id
      and membership.user_id = public.current_firebase_uid()
  );
$$;

create or replace function public.is_campaign_master(target_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members membership
    join public.campaign_access_grants access
      on access.campaign_id = membership.campaign_id
      and access.email = lower(trim(auth.jwt()->>'email'))
      and access.enabled and access.role = 'master'
    where membership.campaign_id = target_campaign_id
      and membership.user_id = public.current_firebase_uid()
      and membership.role = 'master'
  );
$$;

alter policy "Controllers can update tokens" on public.tokens
using (
  public.can_view_scene(scene_id) and (
    public.is_campaign_master(public.scene_campaign_id(scene_id))
    or owner_user_id = public.current_firebase_uid()
  )
)
with check (
  public.can_view_scene(scene_id) and (
    public.is_campaign_master(public.scene_campaign_id(scene_id))
    or owner_user_id = public.current_firebase_uid()
  )
);
alter policy "Controllers can delete tokens" on public.tokens
using (
  public.can_view_scene(scene_id) and (
    public.is_campaign_master(public.scene_campaign_id(scene_id))
    or owner_user_id = public.current_firebase_uid()
  )
);

alter policy "Authors can update drawings" on public.drawings
using (
  public.can_view_scene(scene_id) and (
    author_user_id = public.current_firebase_uid()
    or public.is_campaign_master(public.scene_campaign_id(scene_id))
  )
)
with check (
  public.can_view_scene(scene_id) and (
    author_user_id = public.current_firebase_uid()
    or public.is_campaign_master(public.scene_campaign_id(scene_id))
  )
);
alter policy "Authors can delete drawings" on public.drawings
using (
  public.can_view_scene(scene_id) and (
    author_user_id = public.current_firebase_uid()
    or public.is_campaign_master(public.scene_campaign_id(scene_id))
  )
);

create or replace function public.can_view_token_stats(target_token_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tokens token
    where token.id = target_token_id and public.can_view_scene(token.scene_id)
      and (
        token.owner_user_id = public.current_firebase_uid()
        or public.is_campaign_master(public.scene_campaign_id(token.scene_id))
      )
  );
$$;

revoke all on function public.is_campaign_member(uuid) from public, anon;
revoke all on function public.is_campaign_master(uuid) from public, anon;
grant execute on function public.is_campaign_member(uuid) to authenticated, service_role;
grant execute on function public.is_campaign_master(uuid) to authenticated, service_role;
