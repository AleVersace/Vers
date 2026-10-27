-- With RLS enabled, Postgres Changes exposes only the primary key in DELETE
-- payloads. Keep a small, authorized journal with the campaign and scene that
-- were known before the row disappeared, so clients never have to guess which
-- view must be reconciled.
create table public.scene_delete_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null
    references public.campaigns(id) on delete cascade,
  scene_id uuid,
  entity_table text not null check (
    entity_table in (
      'assets',
      'scenes',
      'tokens',
      'token_stats',
      'scene_assets',
      'drawings',
      'initiative_entries',
      'initiative_state'
    )
  ),
  entity_id uuid not null,
  created_at timestamptz not null default now()
);

create index scene_delete_events_campaign_id_idx
  on public.scene_delete_events(campaign_id, id desc);

alter table public.scene_delete_events enable row level security;

create policy "Campaign members can read scene delete events"
on public.scene_delete_events
for select
to authenticated
using (public.is_campaign_member(campaign_id));

grant select on public.scene_delete_events to authenticated;

create function public.write_scene_delete_event(
  target_campaign_id uuid,
  target_scene_id uuid,
  target_entity_table text,
  target_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_campaign_id is null or target_entity_id is null then
    return;
  end if;

  insert into public.scene_delete_events (
    campaign_id,
    scene_id,
    entity_table,
    entity_id
  )
  values (
    target_campaign_id,
    target_scene_id,
    target_entity_table,
    target_entity_id
  );

  -- The journal is a delivery aid, not an audit log. A bounded history also
  -- keeps Realtime authorization checks cheap on the free Supabase plan.
  delete from public.scene_delete_events event
  where event.campaign_id = target_campaign_id
    and event.id < coalesce(
      (
        select min(recent.id)
        from (
          select candidate.id
          from public.scene_delete_events candidate
          where candidate.campaign_id = target_campaign_id
          order by candidate.id desc
          limit 1000
        ) recent
      ),
      event.id
    );
end;
$$;

revoke all on function public.write_scene_delete_event(uuid, uuid, text, uuid)
from public;

create function public.record_scene_row_delete_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_scene_id uuid;
  target_campaign_id uuid;
  target_entity_id uuid;
begin
  target_scene_id := nullif(to_jsonb(old)->>'scene_id', '')::uuid;
  target_entity_id := nullif(to_jsonb(old)->>tg_argv[1], '')::uuid;

  select scene.campaign_id
  into target_campaign_id
  from public.scenes scene
  where scene.id = target_scene_id;

  perform public.write_scene_delete_event(
    target_campaign_id,
    target_scene_id,
    tg_argv[0],
    target_entity_id
  );
  return old;
end;
$$;

create function public.record_scene_delete_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.write_scene_delete_event(
    old.campaign_id,
    old.id,
    'scenes',
    old.id
  );
  return old;
end;
$$;

create function public.record_asset_delete_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.write_scene_delete_event(
    old.campaign_id,
    null,
    'assets',
    old.id
  );
  return old;
end;
$$;

create function public.record_token_stats_delete_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_scene_id uuid;
  target_campaign_id uuid;
begin
  select token.scene_id, scene.campaign_id
  into target_scene_id, target_campaign_id
  from public.tokens token
  join public.scenes scene on scene.id = token.scene_id
  where token.id = old.token_id;

  perform public.write_scene_delete_event(
    target_campaign_id,
    target_scene_id,
    'token_stats',
    old.token_id
  );
  return old;
end;
$$;

revoke all on function public.record_scene_row_delete_event() from public;
revoke all on function public.record_scene_delete_event() from public;
revoke all on function public.record_asset_delete_event() from public;
revoke all on function public.record_token_stats_delete_event() from public;

create trigger assets_record_delete_event
before delete on public.assets
for each row execute function public.record_asset_delete_event();

create trigger scenes_record_delete_event
before delete on public.scenes
for each row execute function public.record_scene_delete_event();

create trigger tokens_record_delete_event
before delete on public.tokens
for each row execute function public.record_scene_row_delete_event('tokens', 'id');

create trigger scene_assets_record_delete_event
before delete on public.scene_assets
for each row execute function public.record_scene_row_delete_event('scene_assets', 'id');

create trigger drawings_record_delete_event
before delete on public.drawings
for each row execute function public.record_scene_row_delete_event('drawings', 'id');

create trigger initiative_entries_record_delete_event
before delete on public.initiative_entries
for each row execute function public.record_scene_row_delete_event('initiative_entries', 'id');

create trigger initiative_state_record_delete_event
before delete on public.initiative_state
for each row execute function public.record_scene_row_delete_event('initiative_state', 'scene_id');

create trigger token_stats_record_delete_event
before delete on public.token_stats
for each row execute function public.record_token_stats_delete_event();

alter publication supabase_realtime add table public.scene_delete_events;
