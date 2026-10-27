-- Macro names are shown in full in token details and roll history. Keep the
-- three-character diamond abbreviation while allowing a more descriptive name.
alter table public.character_macros
  drop constraint if exists character_macros_name_length;

alter table public.character_macros
  add constraint character_macros_name_length check (
    char_length(trim(name)) between 1 and 64
  );
