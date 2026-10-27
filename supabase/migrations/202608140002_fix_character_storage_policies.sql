-- Storage policies run in their own request context. Resolve character
-- ownership through a narrow security-definer helper so the check does not
-- depend on recursively evaluating the characters SELECT policy.
create function public.owns_character_storage_object(
  target_character_id uuid,
  target_storage_path text
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
      and character.token_storage_path = target_storage_path
  );
$$;

revoke all on function public.owns_character_storage_object(uuid, text)
from public;
grant execute on function public.owns_character_storage_object(uuid, text)
to authenticated;

alter policy "Character owners can upload token images"
on storage.objects
with check (
  bucket_id = 'vers-assets'
  and (storage.foldername(name))[1] = 'characters'
  and public.owns_character_storage_object(
    public.try_uuid((storage.foldername(name))[2]),
    name
  )
);

alter policy "Character owners can update token images"
on storage.objects
using (
  bucket_id = 'vers-assets'
  and public.owns_character_storage_object(
    public.try_uuid((storage.foldername(name))[2]),
    name
  )
)
with check (
  bucket_id = 'vers-assets'
  and (storage.foldername(name))[1] = 'characters'
  and public.owns_character_storage_object(
    public.try_uuid((storage.foldername(name))[2]),
    name
  )
);

alter policy "Character owners can delete token images"
on storage.objects
using (
  bucket_id = 'vers-assets'
  and public.owns_character_storage_object(
    public.try_uuid((storage.foldername(name))[2]),
    name
  )
);
