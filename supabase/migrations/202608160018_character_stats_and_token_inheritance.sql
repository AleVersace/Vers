-- Base combat statistics belong to a character/NPC, but must not become
-- visible merely because the character has a visible scene token. They live
-- in a controller-only table and are copied once when a token is placed.
create table public.character_stats (
  character_id uuid primary key
    references public.characters(id) on delete cascade,
  hp_current numeric,
  hp_max numeric,
  armor_class smallint,
  difficulty_class smallint,
  saving_throws jsonb,
  speed_ft numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint character_stats_hp_current_check
    check (hp_current is null or hp_current >= 0),
  constraint character_stats_hp_max_check
    check (hp_max is null or hp_max > 0),
  constraint character_stats_hp_range_check
    check (
      hp_current is null
      or hp_max is null
      or hp_current <= hp_max
    ),
  constraint character_stats_speed_check
    check (speed_ft is null or speed_ft >= 0),
  constraint character_stats_saves_object_check
    check (saving_throws is null or jsonb_typeof(saving_throws) = 'object')
);

create trigger character_stats_set_updated_at
before update on public.character_stats
for each row execute function public.set_updated_at();

alter table public.character_stats enable row level security;

create policy "Character controllers can read base stats"
on public.character_stats
for select
to authenticated
using (public.can_manage_character(character_id));

create policy "Character controllers can create base stats"
on public.character_stats
for insert
to authenticated
with check (public.can_manage_character(character_id));

create policy "Character controllers can update base stats"
on public.character_stats
for update
to authenticated
using (public.can_manage_character(character_id))
with check (public.can_manage_character(character_id));

create policy "Character controllers can delete base stats"
on public.character_stats
for delete
to authenticated
using (public.can_manage_character(character_id));

grant select, insert, update, delete on public.character_stats to authenticated;

create function public.inherit_character_stats_on_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.character_id is null then
    return new;
  end if;

  insert into public.token_stats (
    token_id,
    hp_current,
    hp_max,
    armor_class,
    difficulty_class,
    saving_throws,
    speed_ft,
    notes
  )
  select
    new.id,
    stats.hp_current,
    stats.hp_max,
    stats.armor_class,
    stats.difficulty_class,
    stats.saving_throws,
    stats.speed_ft,
    stats.notes
  from public.character_stats stats
  where stats.character_id = new.character_id
  on conflict (token_id) do nothing;

  return new;
end;
$$;

create trigger tokens_inherit_character_stats
after insert on public.tokens
for each row execute function public.inherit_character_stats_on_token();

alter publication supabase_realtime add table public.character_stats;
