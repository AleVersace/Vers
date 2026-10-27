-- A per-token marker, independent from the source character, lets controllers
-- communicate that a creature is dead directly on the shared battle map.
alter table public.tokens
  add column is_dead boolean not null default false;
