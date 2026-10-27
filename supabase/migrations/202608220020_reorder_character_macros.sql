-- Reorder one character macro atomically. The dragged macro follows the target
-- into its section, while both the source and target sections are normalized
-- to contiguous sort positions. Board and token views therefore share exactly
-- the same persisted order.
create or replace function public.reorder_character_macro(
  p_dragged_macro_id uuid,
  p_target_macro_id uuid,
  p_place_after boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dragged_macro public.character_macros%rowtype;
  target_macro public.character_macros%rowtype;
  insertion_position integer;
begin
  if p_dragged_macro_id = p_target_macro_id then
    return;
  end if;

  select macro.*
  into dragged_macro
  from public.character_macros macro
  where macro.id = p_dragged_macro_id;

  if not found then
    raise exception 'Dragged macro not found';
  end if;

  select macro.*
  into target_macro
  from public.character_macros macro
  where macro.id = p_target_macro_id;

  if not found then
    raise exception 'Target macro not found';
  end if;

  if dragged_macro.character_id <> target_macro.character_id then
    raise exception 'Macros belong to different characters';
  end if;

  if not public.can_manage_character_macros(dragged_macro.character_id) then
    raise exception 'Not allowed to reorder these macros'
      using errcode = '42501';
  end if;

  -- Serialize concurrent reorder attempts for this character.
  perform 1
  from public.character_macros macro
  where macro.character_id = dragged_macro.character_id
  for update;

  select ranked.position + case when p_place_after then 1 else 0 end
  into insertion_position
  from (
    select
      macro.id,
      (row_number() over (
        order by macro.sort_order, macro.created_at, macro.id
      ) - 1)::integer as position
    from public.character_macros macro
    where macro.character_id = dragged_macro.character_id
      and macro.category_id is not distinct from target_macro.category_id
      and macro.id <> dragged_macro.id
  ) ranked
  where ranked.id = target_macro.id;

  if insertion_position is null then
    raise exception 'Target macro is not available for reordering';
  end if;

  if dragged_macro.category_id is distinct from target_macro.category_id then
    with ranked_source as (
      select
        macro.id,
        (row_number() over (
          order by macro.sort_order, macro.created_at, macro.id
        ) - 1)::integer as position
      from public.character_macros macro
      where macro.character_id = dragged_macro.character_id
        and macro.category_id is not distinct from dragged_macro.category_id
        and macro.id <> dragged_macro.id
    )
    update public.character_macros macro
    set sort_order = ranked_source.position
    from ranked_source
    where macro.id = ranked_source.id
      and macro.sort_order is distinct from ranked_source.position;
  end if;

  with ranked_target as (
    select
      macro.id,
      (row_number() over (
        order by macro.sort_order, macro.created_at, macro.id
      ) - 1)::integer as position
    from public.character_macros macro
    where macro.character_id = dragged_macro.character_id
      and macro.category_id is not distinct from target_macro.category_id
      and macro.id <> dragged_macro.id
  )
  update public.character_macros macro
  set sort_order = case
    when ranked_target.position >= insertion_position
      then ranked_target.position + 1
    else ranked_target.position
  end
  from ranked_target
  where macro.id = ranked_target.id;

  update public.character_macros macro
  set
    category_id = target_macro.category_id,
    sort_order = insertion_position
  where macro.id = dragged_macro.id;
end;
$$;

revoke all on function public.reorder_character_macro(uuid, uuid, boolean)
from public;

grant execute on function public.reorder_character_macro(uuid, uuid, boolean)
to authenticated;
