-- Shared, immutable dice history for each campaign. Entries are snapshots so
-- deleting or editing a macro later never changes what the group rolled.
create table public.dice_roll_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    references public.campaigns(id) on delete cascade,
  scene_id uuid
    references public.scenes(id) on delete set null,
  roller_user_id text not null
    references public.app_users(firebase_uid) on delete cascade,
  character_id uuid
    references public.characters(id) on delete set null,
  roll_kind text not null,
  actor_name text not null,
  roller_name text not null,
  roll_name text not null,
  formula text not null,
  breakdown text not null,
  total integer not null,
  details jsonb not null default '{"dice":[],"bonuses":[]}'::jsonb,
  created_at timestamptz not null default now(),
  constraint dice_roll_log_kind check (
    roll_kind in ('quick_die', 'macro')
  ),
  constraint dice_roll_log_actor_name_length check (
    char_length(trim(actor_name)) between 1 and 80
  ),
  constraint dice_roll_log_roller_name_length check (
    char_length(trim(roller_name)) between 1 and 80
  ),
  constraint dice_roll_log_roll_name_length check (
    char_length(trim(roll_name)) between 1 and 80
  ),
  constraint dice_roll_log_formula_length check (
    char_length(formula) between 1 and 2000
  ),
  constraint dice_roll_log_breakdown_length check (
    char_length(breakdown) between 1 and 5000
  ),
  constraint dice_roll_log_total_range check (
    total between -100000000 and 100000000
  ),
  constraint dice_roll_log_details_object check (
    jsonb_typeof(details) = 'object'
    and jsonb_typeof(details->'dice') = 'array'
    and jsonb_typeof(details->'bonuses') = 'array'
  )
);

create index dice_roll_log_campaign_created_idx
  on public.dice_roll_log(campaign_id, created_at desc);

alter table public.dice_roll_log enable row level security;

create policy "Members can read campaign dice rolls"
on public.dice_roll_log
for select
to authenticated
using (public.is_campaign_member(campaign_id));

create policy "Members can record their own dice rolls"
on public.dice_roll_log
for insert
to authenticated
with check (
  roller_user_id = public.current_firebase_uid()
  and public.is_campaign_member(campaign_id)
  and (
    scene_id is null
    or public.scene_campaign_id(scene_id) = campaign_id
  )
  and (
    character_id is null
    or public.owns_character(character_id)
    or (
      public.is_campaign_master(campaign_id)
      and exists (
        select 1
        from public.tokens token
        join public.scenes scene on scene.id = token.scene_id
        where token.character_id = dice_roll_log.character_id
          and scene.campaign_id = dice_roll_log.campaign_id
      )
    )
  )
);

grant select, insert on public.dice_roll_log to authenticated;

alter publication supabase_realtime add table public.dice_roll_log;
