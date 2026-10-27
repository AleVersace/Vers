-- Character metadata and token images follow the same visibility rules as the
-- scene token. Hidden master tokens must not reveal their character library
-- entry to players who can otherwise view the scene.
create or replace function public.can_view_character(
  target_character_id uuid
)
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
  )
  or exists (
    select 1
    from public.tokens token
    where token.character_id = target_character_id
      and public.can_view_scene(token.scene_id)
      and (
        token.visible_to_players
        or token.owner_user_id = public.current_firebase_uid()
        or public.is_campaign_master(
          public.scene_campaign_id(token.scene_id)
        )
      )
  );
$$;
