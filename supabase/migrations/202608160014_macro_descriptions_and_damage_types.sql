-- Macro notes stay lightweight, while damage metadata mirrors every modular
-- die and fixed modifier (including temporary bonuses) by array position.
alter table public.character_macros
  add column description text not null default '',
  add column is_damage_macro boolean not null default false,
  add column dice_damage_types text[] not null default array[]::text[],
  add column bonus_damage_types text[] not null default array[]::text[],
  add column temporary_dice_damage_types text[] not null default array[]::text[],
  add column temporary_bonus_damage_types text[] not null default array[]::text[];

update public.character_macros
set
  dice_damage_types = case
    when cardinality(dice_sides) = 0 then array[]::text[]
    else array_fill(''::text, array[cardinality(dice_sides)])
  end,
  bonus_damage_types = case
    when cardinality(bonuses) = 0 then array[]::text[]
    else array_fill(''::text, array[cardinality(bonuses)])
  end,
  temporary_dice_damage_types = case
    when cardinality(temporary_dice_sides) = 0 then array[]::text[]
    else array_fill(''::text, array[cardinality(temporary_dice_sides)])
  end,
  temporary_bonus_damage_types = case
    when cardinality(temporary_bonuses) = 0 then array[]::text[]
    else array_fill(''::text, array[cardinality(temporary_bonuses)])
  end;

alter table public.character_macros
  alter column dice_damage_types set default array['']::text[];

alter table public.character_macros
  add constraint character_macros_description_length check (
    char_length(description) <= 120
  ),
  add constraint character_macros_dice_damage_types_count check (
    cardinality(dice_damage_types) = cardinality(dice_sides)
  ),
  add constraint character_macros_bonus_damage_types_count check (
    cardinality(bonus_damage_types) = cardinality(bonuses)
  ),
  add constraint character_macros_temporary_dice_damage_types_count check (
    cardinality(temporary_dice_damage_types) = cardinality(temporary_dice_sides)
  ),
  add constraint character_macros_temporary_bonus_damage_types_count check (
    cardinality(temporary_bonus_damage_types) = cardinality(temporary_bonuses)
  ),
  add constraint character_macros_dice_damage_types_values check (
    array_position(dice_damage_types, null) is null
    and dice_damage_types <@ array[
      '', 'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
      'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing',
      'thunder'
    ]::text[]
  ),
  add constraint character_macros_bonus_damage_types_values check (
    array_position(bonus_damage_types, null) is null
    and bonus_damage_types <@ array[
      '', 'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
      'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing',
      'thunder'
    ]::text[]
  ),
  add constraint character_macros_temporary_dice_damage_types_values check (
    array_position(temporary_dice_damage_types, null) is null
    and temporary_dice_damage_types <@ array[
      '', 'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
      'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing',
      'thunder'
    ]::text[]
  ),
  add constraint character_macros_temporary_bonus_damage_types_values check (
    array_position(temporary_bonus_damage_types, null) is null
    and temporary_bonus_damage_types <@ array[
      '', 'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
      'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing',
      'thunder'
    ]::text[]
  );
