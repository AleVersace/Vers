-- Keep parallel damage arrays valid even when an older client only updates
-- the numeric macro components. Existing labels are preserved by position;
-- newly added components start without a damage type.
create function public.keep_macro_damage_metadata_aligned()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.dice_damage_types := coalesce(
    (
      select array_agg(
        coalesce(new.dice_damage_types[item.position], '')
        order by item.position
      )
      from generate_series(1, cardinality(new.dice_sides))
        as item(position)
    ),
    array[]::text[]
  );
  new.bonus_damage_types := coalesce(
    (
      select array_agg(
        coalesce(new.bonus_damage_types[item.position], '')
        order by item.position
      )
      from generate_series(1, cardinality(new.bonuses))
        as item(position)
    ),
    array[]::text[]
  );
  new.temporary_dice_damage_types := coalesce(
    (
      select array_agg(
        coalesce(new.temporary_dice_damage_types[item.position], '')
        order by item.position
      )
      from generate_series(1, cardinality(new.temporary_dice_sides))
        as item(position)
    ),
    array[]::text[]
  );
  new.temporary_bonus_damage_types := coalesce(
    (
      select array_agg(
        coalesce(new.temporary_bonus_damage_types[item.position], '')
        order by item.position
      )
      from generate_series(1, cardinality(new.temporary_bonuses))
        as item(position)
    ),
    array[]::text[]
  );
  return new;
end;
$$;

create trigger character_macros_sync_damage_metadata
before insert or update on public.character_macros
for each row execute function public.keep_macro_damage_metadata_aligned();
