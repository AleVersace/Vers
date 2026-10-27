-- Macro sections let whoever controls a character group its macros under
-- named, reorderable dividers shared by the board dock and the token panel.
-- Categories follow the character like macros do and reuse the same access
-- rules; deleting a category detaches its macros instead of deleting them.
create table public.character_macro_categories (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null
    references public.characters(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint character_macro_categories_name_length check (
    char_length(trim(name)) between 1 and 24
  ),
  constraint character_macro_categories_id_character_key
    unique (id, character_id)
);

create unique index character_macro_categories_character_name_idx
  on public.character_macro_categories(character_id, lower(trim(name)));

create index character_macro_categories_character_sort_idx
  on public.character_macro_categories(character_id, sort_order, created_at);

create trigger character_macro_categories_set_updated_at
before update on public.character_macro_categories
for each row execute function public.set_updated_at();

alter table public.character_macro_categories enable row level security;

create policy "Character controllers can read macro categories"
on public.character_macro_categories
for select
to authenticated
using (public.can_manage_character_macros(character_id));

create policy "Character controllers can create macro categories"
on public.character_macro_categories
for insert
to authenticated
with check (public.can_manage_character_macros(character_id));

create policy "Character controllers can update macro categories"
on public.character_macro_categories
for update
to authenticated
using (public.can_manage_character_macros(character_id))
with check (public.can_manage_character_macros(character_id));

create policy "Character controllers can delete macro categories"
on public.character_macro_categories
for delete
to authenticated
using (public.can_manage_character_macros(character_id));

grant select, insert, update, delete
on public.character_macro_categories
to authenticated;

alter publication supabase_realtime add table public.character_macro_categories;

-- A macro may only sit inside a category of its own character. Dropping the
-- category clears the assignment (set null) and never touches the macro.
alter table public.character_macros
  add column category_id uuid;

alter table public.character_macros
  add constraint character_macros_category_same_character
  foreign key (category_id, character_id)
  references public.character_macro_categories (id, character_id)
  on delete set null (category_id);

create index character_macros_category_idx
  on public.character_macros(category_id);
