-- Initiative groups let the Master merge several tokens (typically minions)
-- into one named entry that rolls a single initiative value. A group is
-- itself an initiative entry without a token; member entries keep existing
-- but point at the group and leave the turn order. Deleting the group frees
-- its members back into individual entries thanks to the set-null reference.
alter table public.initiative_entries
  alter column token_id drop not null;

alter table public.initiative_entries
  add column group_name text,
  add column group_entry_id uuid
    references public.initiative_entries(id) on delete set null;

alter table public.initiative_entries
  add constraint initiative_entries_group_shape check (
    (
      token_id is not null
      and group_name is null
    )
    or (
      token_id is null
      and group_name is not null
      and char_length(trim(group_name)) between 1 and 30
      and group_entry_id is null
    )
  );

create index initiative_entries_group_idx
  on public.initiative_entries(group_entry_id);

-- Merge the initiative of the given scene tokens into one group entry. The
-- whole operation is atomic: the group appears, members leave the turn order
-- and the current turn follows them into the group when needed.
create function public.merge_initiative_group(
  p_scene_id uuid,
  p_token_ids uuid[],
  p_group_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_count integer;
  created_group_id uuid;
  resolved_group_name text;
  next_sort_order integer;
begin
  if not public.is_campaign_master(public.scene_campaign_id(p_scene_id)) then
    raise exception 'Only the campaign Master can merge initiative';
  end if;

  if p_token_ids is null or cardinality(p_token_ids) < 2 then
    raise exception 'Select at least two tokens to merge initiative';
  end if;

  select count(*)::integer
  into member_count
  from public.initiative_entries entry
  where entry.scene_id = p_scene_id
    and entry.token_id = any (p_token_ids);

  if member_count < 2 then
    raise exception 'Select at least two tokens to merge initiative';
  end if;

  resolved_group_name = nullif(trim(coalesce(p_group_name, '')), '');
  if resolved_group_name is null then
    select 'Gruppo ' || (count(*) + 1)::text
    into resolved_group_name
    from public.initiative_entries entry
    where entry.scene_id = p_scene_id
      and entry.token_id is null;
  end if;

  select coalesce(max(entry.sort_order) + 1, 0)
  into next_sort_order
  from public.initiative_entries entry
  where entry.scene_id = p_scene_id;

  insert into public.initiative_entries (
    scene_id,
    token_id,
    initiative,
    sort_order,
    group_name
  ) values (
    p_scene_id,
    null,
    null,
    next_sort_order,
    left(resolved_group_name, 30)
  )
  returning id into created_group_id;

  update public.initiative_entries entry
  set group_entry_id = created_group_id,
      initiative = null
  where entry.scene_id = p_scene_id
    and entry.token_id = any (p_token_ids);

  -- The group inherits the turn when it swallows the current entry.
  update public.initiative_state state
  set current_entry_id = created_group_id
  where state.scene_id = p_scene_id
    and state.current_entry_id in (
      select member.id
      from public.initiative_entries member
      where member.group_entry_id = created_group_id
    );

  -- Groups emptied by this merge disappear instead of lingering.
  delete from public.initiative_entries entry
  where entry.scene_id = p_scene_id
    and entry.token_id is null
    and entry.id <> created_group_id
    and not exists (
      select 1
      from public.initiative_entries member
      where member.group_entry_id = entry.id
    );

  return created_group_id;
end;
$$;

revoke all on function public.merge_initiative_group(uuid, uuid[], text)
from public;

grant execute on function public.merge_initiative_group(uuid, uuid[], text)
to authenticated;
