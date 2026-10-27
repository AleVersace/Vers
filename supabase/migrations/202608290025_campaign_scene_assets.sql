-- Reusable campaign props (carts, furniture, scenery, etc.) live in the
-- existing asset library. Each placement keeps independent pixel geometry so
-- it can move and resize without snapping to the scene grid.
alter type public.asset_kind add value if not exists 'prop';

create table public.scene_assets (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  created_by_uid text not null references public.app_users(firebase_uid),
  x numeric not null default 0 check (x >= 0),
  y numeric not null default 0 check (y >= 0),
  width numeric not null default 128 check (width between 24 and 4000),
  height numeric not null default 128 check (height between 24 and 4000),
  z_index integer not null default 0,
  visible_to_players boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scene_assets_scene_z_index
  on public.scene_assets(scene_id, z_index, created_at);

create index scene_assets_asset_id
  on public.scene_assets(asset_id);

create trigger scene_assets_set_updated_at
before update on public.scene_assets
for each row execute function public.set_updated_at();

alter table public.scene_assets enable row level security;

create policy "Scene viewers can read placed assets"
on public.scene_assets
for select
to authenticated
using (
  public.can_view_scene(scene_id)
  and (
    visible_to_players
    or public.is_campaign_master(public.scene_campaign_id(scene_id))
  )
);

create policy "Masters can place scene assets"
on public.scene_assets
for insert
to authenticated
with check (
  created_by_uid = public.current_firebase_uid()
  and public.is_campaign_master(public.scene_campaign_id(scene_id))
  and exists (
    select 1
    from public.assets asset
    where asset.id = asset_id
      and asset.campaign_id = public.scene_campaign_id(scene_id)
      and asset.kind::text = 'prop'
  )
);

create policy "Masters can update scene assets"
on public.scene_assets
for update
to authenticated
using (public.is_campaign_master(public.scene_campaign_id(scene_id)))
with check (
  public.is_campaign_master(public.scene_campaign_id(scene_id))
  and exists (
    select 1
    from public.assets asset
    where asset.id = asset_id
      and asset.campaign_id = public.scene_campaign_id(scene_id)
      and asset.kind::text = 'prop'
  )
);

create policy "Masters can delete scene assets"
on public.scene_assets
for delete
to authenticated
using (public.is_campaign_master(public.scene_campaign_id(scene_id)));

grant select, insert, update, delete
on public.scene_assets
to authenticated;

-- Players only need metadata for props that are actually visible in the scene
-- they can currently view. Masters retain access to the complete library.
drop policy if exists "Members can read allowed assets" on public.assets;

create policy "Members can read allowed assets"
on public.assets
for select
to authenticated
using (
  public.is_campaign_member(campaign_id)
  and (
    kind = 'token'
    or public.is_campaign_master(campaign_id)
    or exists (
      select 1
      from public.scenes scene
      where scene.map_asset_id = assets.id
        and public.can_view_scene(scene.id)
    )
    or exists (
      select 1
      from public.scene_assets placement
      where placement.asset_id = assets.id
        and public.can_view_scene(placement.scene_id)
        and (
          placement.visible_to_players
          or public.is_campaign_master(campaign_id)
        )
    )
  )
);

alter publication supabase_realtime add table public.assets;
alter publication supabase_realtime add table public.scene_assets;
