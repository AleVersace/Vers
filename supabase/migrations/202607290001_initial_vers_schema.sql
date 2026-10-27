create extension if not exists pgcrypto;

create type public.campaign_role as enum ('master', 'player');
create type public.asset_kind as enum ('map', 'token');
create type public.grid_kind as enum ('square', 'none');
create type public.drawing_kind as enum (
  'freehand',
  'line',
  'rectangle',
  'ellipse',
  'text'
);
create type public.scene_visibility as enum ('players', 'master');

create table public.app_users (
  firebase_uid text primary key,
  email text,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by_uid text not null references public.app_users(firebase_uid),
  player_scene_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id text not null references public.app_users(firebase_uid) on delete cascade,
  role public.campaign_role not null,
  character_name text,
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind public.asset_kind not null,
  name text not null,
  storage_path text not null unique,
  mime_type text,
  width integer,
  height integer,
  created_by_uid text not null references public.app_users(firebase_uid),
  created_at timestamptz not null default now()
);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  map_asset_id uuid references public.assets(id) on delete set null,
  grid public.grid_kind not null default 'square',
  grid_columns integer not null default 36 check (grid_columns > 0),
  grid_rows integer not null default 24 check (grid_rows > 0),
  grid_cell_px integer not null default 56 check (grid_cell_px > 0),
  grid_offset_x numeric not null default 0,
  grid_offset_y numeric not null default 0,
  distance_per_cell numeric not null default 5 check (distance_per_cell > 0),
  distance_unit text not null default 'ft' check (distance_unit in ('ft', 'm')),
  fog_enabled boolean not null default true,
  revealed_cells text[] not null default '{}',
  background_color text not null default '#11120f',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, name)
);

alter table public.campaigns
  add constraint campaigns_player_scene_id_fkey
  foreign key (player_scene_id)
  references public.scenes(id)
  on delete set null;

create table public.tokens (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  owner_user_id text references public.app_users(firebase_uid) on delete set null,
  created_by_uid text not null references public.app_users(firebase_uid),
  image_asset_id uuid references public.assets(id) on delete set null,
  name text not null,
  initials text,
  color text not null default '#b08a55',
  x numeric not null default 0,
  y numeric not null default 0,
  size numeric not null default 1 check (size > 0),
  rotation numeric not null default 0,
  locked boolean not null default false,
  visible_to_players boolean not null default true,
  hp_current numeric,
  hp_max numeric,
  armor_class smallint,
  difficulty_class smallint,
  saving_throws jsonb,
  speed_ft numeric,
  notes text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hp_current is null or hp_current >= 0),
  check (hp_max is null or hp_max > 0),
  check (
    hp_current is null
    or hp_max is null
    or hp_current <= hp_max
  )
);

create table public.drawings (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  author_user_id text not null references public.app_users(firebase_uid),
  kind public.drawing_kind not null,
  points jsonb not null,
  style jsonb not null default '{}',
  text_content text,
  visibility public.scene_visibility not null default 'players',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.initiative_entries (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  token_id uuid not null references public.tokens(id) on delete cascade,
  initiative numeric,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scene_id, token_id)
);

create table public.initiative_state (
  scene_id uuid primary key references public.scenes(id) on delete cascade,
  round integer not null default 1 check (round > 0),
  current_entry_id uuid references public.initiative_entries(id) on delete set null,
  is_running boolean not null default false,
  updated_at timestamptz not null default now()
);

create index campaign_members_user_idx
  on public.campaign_members(user_id);
create index scenes_campaign_sort_idx
  on public.scenes(campaign_id, sort_order);
create index assets_campaign_kind_idx
  on public.assets(campaign_id, kind);
create index tokens_scene_idx
  on public.tokens(scene_id);
create index tokens_owner_idx
  on public.tokens(owner_user_id);
create index drawings_scene_idx
  on public.drawings(scene_id);
create index initiative_entries_scene_sort_idx
  on public.initiative_entries(scene_id, sort_order);

create function public.current_firebase_uid()
returns text
language sql
stable
as $$
  select nullif(auth.jwt()->>'sub', '');
$$;

create function public.try_uuid(value text)
returns uuid
language plpgsql
immutable
strict
as $$
begin
  return value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create function public.is_campaign_member(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members membership
    where membership.campaign_id = target_campaign_id
      and membership.user_id = public.current_firebase_uid()
  );
$$;

create function public.is_campaign_master(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members membership
    where membership.campaign_id = target_campaign_id
      and membership.user_id = public.current_firebase_uid()
      and membership.role = 'master'
  );
$$;

create function public.scene_campaign_id(target_scene_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select scene.campaign_id
  from public.scenes scene
  where scene.id = target_scene_id;
$$;

create function public.can_view_scene(target_scene_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.scenes scene
    join public.campaigns campaign on campaign.id = scene.campaign_id
    where scene.id = target_scene_id
      and (
        public.is_campaign_master(scene.campaign_id)
        or (
          public.is_campaign_member(scene.campaign_id)
          and campaign.player_scene_id = scene.id
        )
      )
  );
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

create trigger scenes_set_updated_at
before update on public.scenes
for each row execute function public.set_updated_at();

create trigger tokens_set_updated_at
before update on public.tokens
for each row execute function public.set_updated_at();

create trigger drawings_set_updated_at
before update on public.drawings
for each row execute function public.set_updated_at();

create trigger initiative_entries_set_updated_at
before update on public.initiative_entries
for each row execute function public.set_updated_at();

create trigger initiative_state_set_updated_at
before update on public.initiative_state
for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.assets enable row level security;
alter table public.scenes enable row level security;
alter table public.tokens enable row level security;
alter table public.drawings enable row level security;
alter table public.initiative_entries enable row level security;
alter table public.initiative_state enable row level security;

create policy "Authenticated users can read profiles"
on public.app_users
for select
to authenticated
using (true);

create policy "Users can create their own profile"
on public.app_users
for insert
to authenticated
with check (firebase_uid = public.current_firebase_uid());

create policy "Users can update their own profile"
on public.app_users
for update
to authenticated
using (firebase_uid = public.current_firebase_uid())
with check (firebase_uid = public.current_firebase_uid());

create policy "Members can read campaigns"
on public.campaigns
for select
to authenticated
using (public.is_campaign_member(id));

create policy "Masters can update campaigns"
on public.campaigns
for update
to authenticated
using (public.is_campaign_master(id))
with check (public.is_campaign_master(id));

create policy "Members can read campaign memberships"
on public.campaign_members
for select
to authenticated
using (public.is_campaign_member(campaign_id));

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
  )
);

create policy "Members can upload token assets"
on public.assets
for insert
to authenticated
with check (
  created_by_uid = public.current_firebase_uid()
  and (
    public.is_campaign_master(campaign_id)
    or (
      public.is_campaign_member(campaign_id)
      and kind = 'token'
    )
  )
);

create policy "Masters can update assets"
on public.assets
for update
to authenticated
using (public.is_campaign_master(campaign_id))
with check (public.is_campaign_master(campaign_id));

create policy "Masters can delete assets"
on public.assets
for delete
to authenticated
using (public.is_campaign_master(campaign_id));

create policy "Members can read visible scenes"
on public.scenes
for select
to authenticated
using (public.can_view_scene(id));

create policy "Masters can create scenes"
on public.scenes
for insert
to authenticated
with check (public.is_campaign_master(campaign_id));

create policy "Masters can update scenes"
on public.scenes
for update
to authenticated
using (public.is_campaign_master(campaign_id))
with check (public.is_campaign_master(campaign_id));

create policy "Masters can delete scenes"
on public.scenes
for delete
to authenticated
using (public.is_campaign_master(campaign_id));

create policy "Members can read visible tokens"
on public.tokens
for select
to authenticated
using (
  public.can_view_scene(scene_id)
  and (
    visible_to_players
    or owner_user_id = public.current_firebase_uid()
    or public.is_campaign_master(public.scene_campaign_id(scene_id))
  )
);

create policy "Members can create controlled tokens"
on public.tokens
for insert
to authenticated
with check (
  created_by_uid = public.current_firebase_uid()
  and (
    public.is_campaign_master(public.scene_campaign_id(scene_id))
    or (
      public.can_view_scene(scene_id)
      and owner_user_id = public.current_firebase_uid()
    )
  )
);

create policy "Controllers can update tokens"
on public.tokens
for update
to authenticated
using (
  public.is_campaign_master(public.scene_campaign_id(scene_id))
  or owner_user_id = public.current_firebase_uid()
)
with check (
  public.is_campaign_master(public.scene_campaign_id(scene_id))
  or owner_user_id = public.current_firebase_uid()
);

create policy "Controllers can delete tokens"
on public.tokens
for delete
to authenticated
using (
  public.is_campaign_master(public.scene_campaign_id(scene_id))
  or owner_user_id = public.current_firebase_uid()
);

create policy "Members can read visible drawings"
on public.drawings
for select
to authenticated
using (
  public.can_view_scene(scene_id)
  and (
    visibility = 'players'
    or author_user_id = public.current_firebase_uid()
    or public.is_campaign_master(public.scene_campaign_id(scene_id))
  )
);

create policy "Members can create drawings"
on public.drawings
for insert
to authenticated
with check (
  public.can_view_scene(scene_id)
  and author_user_id = public.current_firebase_uid()
);

create policy "Authors can update drawings"
on public.drawings
for update
to authenticated
using (
  author_user_id = public.current_firebase_uid()
  or public.is_campaign_master(public.scene_campaign_id(scene_id))
)
with check (
  author_user_id = public.current_firebase_uid()
  or public.is_campaign_master(public.scene_campaign_id(scene_id))
);

create policy "Authors can delete drawings"
on public.drawings
for delete
to authenticated
using (
  author_user_id = public.current_firebase_uid()
  or public.is_campaign_master(public.scene_campaign_id(scene_id))
);

create policy "Members can read initiative"
on public.initiative_entries
for select
to authenticated
using (public.can_view_scene(scene_id));

create policy "Masters can create initiative entries"
on public.initiative_entries
for insert
to authenticated
with check (public.is_campaign_master(public.scene_campaign_id(scene_id)));

create policy "Masters can update initiative entries"
on public.initiative_entries
for update
to authenticated
using (public.is_campaign_master(public.scene_campaign_id(scene_id)))
with check (public.is_campaign_master(public.scene_campaign_id(scene_id)));

create policy "Masters can delete initiative entries"
on public.initiative_entries
for delete
to authenticated
using (public.is_campaign_master(public.scene_campaign_id(scene_id)));

create policy "Members can read initiative state"
on public.initiative_state
for select
to authenticated
using (public.can_view_scene(scene_id));

create policy "Masters can create initiative state"
on public.initiative_state
for insert
to authenticated
with check (public.is_campaign_master(public.scene_campaign_id(scene_id)));

create policy "Masters can update initiative state"
on public.initiative_state
for update
to authenticated
using (public.is_campaign_master(public.scene_campaign_id(scene_id)))
with check (public.is_campaign_master(public.scene_campaign_id(scene_id)));

grant usage on schema public to authenticated;
grant select, insert, update on public.app_users to authenticated;
grant select, update on public.campaigns to authenticated;
grant select on public.campaign_members to authenticated;
grant select, insert, update, delete on public.assets to authenticated;
grant select, insert, update, delete on public.scenes to authenticated;
grant select, insert, update, delete on public.tokens to authenticated;
grant select, insert, update, delete on public.drawings to authenticated;
grant select, insert, update, delete on public.initiative_entries to authenticated;
grant select, insert, update on public.initiative_state to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'vers-assets',
  'vers-assets',
  false,
  15728640,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "Campaign members can read assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vers-assets'
  and public.is_campaign_member(
    public.try_uuid((storage.foldername(name))[1])
  )
);

create policy "Campaign members can upload token images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vers-assets'
  and (
    public.is_campaign_master(
      public.try_uuid((storage.foldername(name))[1])
    )
    or (
      public.is_campaign_member(
        public.try_uuid((storage.foldername(name))[1])
      )
      and (storage.foldername(name))[2] = 'tokens'
    )
  )
);

create policy "Campaign masters can update assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vers-assets'
  and public.is_campaign_master(
    public.try_uuid((storage.foldername(name))[1])
  )
)
with check (
  bucket_id = 'vers-assets'
  and public.is_campaign_master(
    public.try_uuid((storage.foldername(name))[1])
  )
);

create policy "Campaign masters can delete assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vers-assets'
  and public.is_campaign_master(
    public.try_uuid((storage.foldername(name))[1])
  )
);

alter publication supabase_realtime add table public.campaigns;
alter publication supabase_realtime add table public.scenes;
alter publication supabase_realtime add table public.tokens;
alter publication supabase_realtime add table public.drawings;
alter publication supabase_realtime add table public.initiative_entries;
alter publication supabase_realtime add table public.initiative_state;
