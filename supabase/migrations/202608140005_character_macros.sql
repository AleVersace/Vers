-- Reusable dice expressions belong to global characters, so they follow the
-- character across every campaign while remaining private to its owner.
create table public.character_macros (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null
    references public.characters(id) on delete cascade,
  name text not null,
  dice_sides integer[] not null default array[20]::integer[],
  bonuses integer[] not null default array[]::integer[],
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint character_macros_name_length check (
    char_length(trim(name)) between 1 and 24
  ),
  constraint character_macros_dice_count check (
    cardinality(dice_sides) between 1 and 50
  ),
  constraint character_macros_dice_sides check (
    2 <= all(dice_sides) and 10000 >= all(dice_sides)
  ),
  constraint character_macros_bonus_count check (
    cardinality(bonuses) <= 50
  ),
  constraint character_macros_bonus_range check (
    -1000000 <= all(bonuses) and 1000000 >= all(bonuses)
  )
);

create unique index character_macros_character_name_idx
  on public.character_macros(character_id, lower(trim(name)));

create index character_macros_character_sort_idx
  on public.character_macros(character_id, sort_order, created_at);

create trigger character_macros_set_updated_at
before update on public.character_macros
for each row execute function public.set_updated_at();

alter table public.character_macros enable row level security;

create function public.owns_character(target_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.characters character
    where character.id = target_character_id
      and character.owner_user_id = public.current_firebase_uid()
  );
$$;

revoke all on function public.owns_character(uuid) from public;
grant execute on function public.owns_character(uuid) to authenticated;

create policy "Owners can read character macros"
on public.character_macros
for select
to authenticated
using (public.owns_character(character_id));

create policy "Owners can create character macros"
on public.character_macros
for insert
to authenticated
with check (public.owns_character(character_id));

create policy "Owners can update character macros"
on public.character_macros
for update
to authenticated
using (public.owns_character(character_id))
with check (public.owns_character(character_id));

create policy "Owners can delete character macros"
on public.character_macros
for delete
to authenticated
using (public.owns_character(character_id));

grant select, insert, update, delete
on public.character_macros
to authenticated;

alter publication supabase_realtime add table public.character_macros;
