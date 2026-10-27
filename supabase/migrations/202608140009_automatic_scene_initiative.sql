-- Initiative membership mirrors scene membership: every token receives one
-- initiative entry, and the existing foreign key removes it with the token.
create function public.add_token_to_scene_initiative()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_sort_order integer;
begin
  select coalesce(max(entry.sort_order) + 1, 0)
  into next_sort_order
  from public.initiative_entries entry
  where entry.scene_id = new.scene_id;

  insert into public.initiative_entries (
    scene_id,
    token_id,
    initiative,
    sort_order
  ) values (
    new.scene_id,
    new.id,
    null,
    next_sort_order
  )
  on conflict (scene_id, token_id) do nothing;

  return new;
end;
$$;

create trigger tokens_add_to_scene_initiative
after insert on public.tokens
for each row execute function public.add_token_to_scene_initiative();

-- Bring tokens that already exist into the tracker without touching scores
-- that were previously entered by the Master.
insert into public.initiative_entries (
  scene_id,
  token_id,
  initiative,
  sort_order
)
select
  token.scene_id,
  token.id,
  null,
  coalesce(
    (
      select max(existing.sort_order) + 1
      from public.initiative_entries existing
      where existing.scene_id = token.scene_id
    ),
    0
  ) + (
    row_number() over (
      partition by token.scene_id
      order by token.created_at, token.id
    ) - 1
  )::integer
from public.tokens token
where not exists (
  select 1
  from public.initiative_entries existing
  where existing.scene_id = token.scene_id
    and existing.token_id = token.id
);

-- Character-linked tokens receive a readable progressive name when they are
-- placed more than once in the same scene. Renaming after creation is free.
create or replace function public.enforce_character_token_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  character_owner text;
  character_name text;
  character_copies integer;
  character_sequence integer;
  candidate_name text;
begin
  if new.character_id is null then
    return new;
  end if;

  select character.owner_user_id, character.name
  into character_owner, character_name
  from public.characters character
  where character.id = new.character_id;

  if character_owner is null then
    raise exception 'Character does not exist'
      using errcode = '23503';
  end if;

  new.owner_user_id = character_owner;

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
