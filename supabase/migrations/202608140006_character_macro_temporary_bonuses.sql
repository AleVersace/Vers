-- Temporary additions stay separate from the base expression so they can be
-- enabled, edited, and cleared without rewriting the character's macro.
alter table public.character_macros
  add column temporary_dice_sides integer[] not null
    default array[]::integer[],
  add column temporary_bonuses integer[] not null
    default array[]::integer[];

alter table public.character_macros
  add constraint character_macros_temporary_dice_count check (
    cardinality(temporary_dice_sides) <= 50
  ),
  add constraint character_macros_temporary_dice_sides check (
    2 <= all(temporary_dice_sides)
    and 10000 >= all(temporary_dice_sides)
  ),
  add constraint character_macros_temporary_bonus_count check (
    cardinality(temporary_bonuses) <= 50
  ),
  add constraint character_macros_temporary_bonus_range check (
    -1000000 <= all(temporary_bonuses)
    and 1000000 >= all(temporary_bonuses)
  );
