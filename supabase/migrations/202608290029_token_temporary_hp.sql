-- Temporary hit points belong to an individual token. They are deliberately
-- absent from character_stats, so placing the same character again starts
-- without temporary HP and changing them never mutates the source character.
alter table public.token_stats
  add column temp_hp numeric;

alter table public.token_stats
  add constraint token_stats_temp_hp_non_negative
  check (temp_hp is null or temp_hp >= 0);
