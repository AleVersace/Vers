-- Campaign NPCs reuse the character and macro model. Player characters remain
-- global and user-owned; NPCs belong to one campaign and are controlled by its
-- Masters.
alter table public.characters
  alter column owner_user_id drop not null;

alter table public.characters
  add column campaign_id uuid
    references public.campaigns(id) on delete cascade,
  add column kind text not null default 'player';

alter table public.characters
  add constraint characters_kind_check
    check (kind in ('player', 'npc')),
  add constraint characters_owner_scope_check
    check (
      (
        kind = 'player'
        and owner_user_id is not null
        and campaign_id is null
      )
      or (
        kind = 'npc'
        and owner_user_id is null
        and campaign_id is not null
      )
    );

create index characters_campaign_npc_idx
  on public.characters(campaign_id, lower(trim(name)))
  where kind = 'npc';

-- Preserve the existing campaign token library by promoting each token asset
-- to an NPC. The asset row stays in place because tokens already on a scene may
-- still reference it directly.
insert into public.characters (
  id,
  owner_user_id,
  campaign_id,
  kind,
  name,
  token_storage_path,
  token_mime_type,
  token_width,
  token_height,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  null,
  asset.campaign_id,
  'npc',
  asset.name,
  asset.storage_path,
  asset.mime_type,
  asset.width,
  asset.height,
  asset.created_at,
  now()
from public.assets asset
where asset.kind = 'token'
  and not exists (
    select 1
    from public.characters character
    where character.token_storage_path = asset.storage_path
  );

create or replace function public.can_manage_character(
  target_character_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.characters character
    where character.id = target_character_id
      and (
        (
          character.kind = 'player'
          and character.owner_user_id = public.current_firebase_uid()
        )
        or (
          character.kind = 'npc'
          and public.is_campaign_master(character.campaign_id)
        )
      )
  );
$$;

revoke all on function public.can_manage_character(uuid) from public;
grant execute on function public.can_manage_character(uuid) to authenticated;

create or replace function public.can_view_character(
  target_character_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_character(target_character_id)
  or exists (
    select 1
    from public.tokens token
    where token.character_id = target_character_id
      and public.can_view_scene(token.scene_id)
      and (
        token.visible_to_players
        or token.owner_user_id = public.current_firebase_uid()
        or public.is_campaign_master(
          public.scene_campaign_id(token.scene_id)
        )
      )
  );
$$;

drop policy "Owners and scene viewers can read characters"
on public.characters;

create policy "Controllers and scene viewers can read characters"
on public.characters
for select
to authenticated
using (
  owner_user_id = public.current_firebase_uid()
  or (
    kind = 'npc'
    and public.is_campaign_master(campaign_id)
  )
  or public.can_view_character(id)
);

drop policy "Users can create their own characters"
on public.characters;

create policy "Controllers can create characters"
on public.characters
for insert
to authenticated
with check (
  (
    kind = 'player'
    and owner_user_id = public.current_firebase_uid()
    and campaign_id is null
  )
  or (
    kind = 'npc'
    and owner_user_id is null
    and public.is_campaign_master(campaign_id)
  )
);

drop policy "Users can update their own characters"
on public.characters;

create policy "Controllers can update characters"
on public.characters
for update
to authenticated
using (public.can_manage_character(id))
with check (
  (
    kind = 'player'
    and owner_user_id = public.current_firebase_uid()
    and campaign_id is null
  )
  or (
    kind = 'npc'
    and owner_user_id is null
    and public.is_campaign_master(campaign_id)
  )
);

drop policy "Users can delete their own characters"
on public.characters;

create policy "Controllers can delete characters"
on public.characters
for delete
to authenticated
using (public.can_manage_character(id));

create or replace function public.owns_character_storage_object(
  target_character_id uuid,
  target_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.characters character
    where character.id = target_character_id
      and character.token_storage_path = target_storage_path
      and public.can_manage_character(character.id)
  );
$$;

create or replace function public.can_manage_character_macros(
  target_character_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_character(target_character_id)
  or exists (
    select 1
    from public.tokens token
    where token.character_id = target_character_id
      and public.is_campaign_master(
        public.scene_campaign_id(token.scene_id)
      )
  );
$$;

-- NPC tokens are unowned and may only be placed in their own campaign.
-- Player-character tokens continue to follow their global owner.
create or replace function public.enforce_character_token_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  character_owner text;
  character_campaign_id uuid;
  character_kind text;
  character_name text;
  character_copies integer;
  character_sequence integer;
  candidate_name text;
begin
  if new.character_id is null then
    return new;
  end if;

  select
    character.owner_user_id,
    character.campaign_id,
    character.kind,
    character.name
  into
    character_owner,
    character_campaign_id,
    character_kind,
    character_name
  from public.characters character
  where character.id = new.character_id;

  if not found then
    raise exception 'Character does not exist'
      using errcode = '23503';
  end if;

  if character_kind = 'npc' then
    if public.scene_campaign_id(new.scene_id) is distinct from character_campaign_id then
      raise exception 'NPC belongs to a different campaign'
        using errcode = '23514';
    end if;
    new.owner_user_id = null;
  else
    new.owner_user_id = character_owner;
  end if;

  if tg_op = 'INSERT' then
    select count(*)::integer
    into character_copies
    from public.tokens token
    where token.scene_id = new.scene_id
      and token.character_id = new.character_id;

    if character_copies = 0 then
      new.name = character_name;
    else
      character_sequence = character_copies + 1;
      candidate_name = character_name || ' ' || character_sequence;

      while exists (
        select 1
        from public.tokens token
        where token.scene_id = new.scene_id
          and token.character_id = new.character_id
          and lower(trim(token.name)) = lower(trim(candidate_name))
      ) loop
        character_sequence = character_sequence + 1;
        candidate_name = character_name || ' ' || character_sequence;
      end loop;

      new.name = candidate_name;
    end if;
  end if;

  return new;
end;
$$;

-- A campaign NPC can be rolled before it has been placed on the current scene.
alter policy "Members can record their own dice rolls"
on public.dice_roll_log
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
    or exists (
      select 1
      from public.characters character
      where character.id = dice_roll_log.character_id
        and character.kind = 'npc'
        and character.campaign_id = dice_roll_log.campaign_id
        and public.is_campaign_master(character.campaign_id)
    )
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
