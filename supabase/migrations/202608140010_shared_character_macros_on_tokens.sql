-- Macros remain global character data. Besides the character owner, a campaign
-- Master may manage them when that character has at least one token in a scene
-- belonging to a campaign they master. This keeps every UI entry point backed
-- by the same character_macros rows instead of creating token-level copies.
create function public.can_manage_character_macros(target_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.owns_character(target_character_id)
  or exists (
    select 1
    from public.tokens token
    where token.character_id = target_character_id
      and public.is_campaign_master(
        public.scene_campaign_id(token.scene_id)
      )
  );
$$;

revoke all on function public.can_manage_character_macros(uuid) from public;
grant execute on function public.can_manage_character_macros(uuid)
to authenticated;

drop policy "Owners can read character macros"
on public.character_macros;

drop policy "Owners can create character macros"
on public.character_macros;

drop policy "Owners can update character macros"
on public.character_macros;

drop policy "Owners can delete character macros"
on public.character_macros;

create policy "Character controllers can read character macros"
on public.character_macros
for select
to authenticated
using (public.can_manage_character_macros(character_id));

create policy "Character controllers can create character macros"
on public.character_macros
for insert
to authenticated
with check (public.can_manage_character_macros(character_id));

create policy "Character controllers can update character macros"
on public.character_macros
for update
to authenticated
using (public.can_manage_character_macros(character_id))
with check (public.can_manage_character_macros(character_id));

create policy "Character controllers can delete character macros"
on public.character_macros
for delete
to authenticated
using (public.can_manage_character_macros(character_id));
