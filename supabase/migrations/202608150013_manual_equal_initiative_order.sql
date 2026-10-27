-- Initiative remains sorted by score. Masters may only exchange the secondary
-- order of two entries when their initiative values are equal.
with ranked_entries as (
  select
    entry.id,
    (
      row_number() over (
        partition by entry.scene_id
        order by entry.sort_order, entry.created_at, entry.id
      ) - 1
    )::integer as next_sort_order
  from public.initiative_entries entry
)
update public.initiative_entries entry
set sort_order = ranked.next_sort_order
from ranked_entries ranked
where ranked.id = entry.id;

alter table public.initiative_entries
  add constraint initiative_entries_scene_order_unique
  unique (scene_id, sort_order)
  deferrable initially deferred;

create function public.swap_equal_initiative_entries(
  p_first_entry_id uuid,
  p_second_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_entry public.initiative_entries%rowtype;
  second_entry public.initiative_entries%rowtype;
begin
  if p_first_entry_id = p_second_entry_id then
    raise exception 'Initiative entries must be different';
  end if;

  -- Always lock in UUID order so two Masters cannot deadlock by requesting
  -- the same exchange in opposite directions.
  perform entry.id
  from public.initiative_entries entry
  where entry.id in (p_first_entry_id, p_second_entry_id)
  order by entry.id
  for update;

  select entry.*
  into first_entry
  from public.initiative_entries entry
  where entry.id = p_first_entry_id;

  select entry.*
  into second_entry
  from public.initiative_entries entry
  where entry.id = p_second_entry_id;

  if first_entry.id is null or second_entry.id is null then
    raise exception 'Initiative entry not found';
  end if;

  if first_entry.scene_id <> second_entry.scene_id then
    raise exception 'Initiative entries belong to different scenes';
  end if;

  if first_entry.initiative is distinct from second_entry.initiative then
    raise exception 'Only equal initiative values can be reordered';
  end if;

  if not public.is_campaign_master(
    public.scene_campaign_id(first_entry.scene_id)
  ) then
    raise exception 'Only the campaign Master can reorder initiative';
  end if;

  update public.initiative_entries entry
  set sort_order = case entry.id
    when first_entry.id then second_entry.sort_order
    when second_entry.id then first_entry.sort_order
  end
  where entry.id in (first_entry.id, second_entry.id);
end;
$$;

revoke all
on function public.swap_equal_initiative_entries(uuid, uuid)
from public;

grant execute
on function public.swap_equal_initiative_entries(uuid, uuid)
to authenticated;
