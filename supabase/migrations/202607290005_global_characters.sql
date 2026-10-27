-- Characters belong to a Firebase user, not to a campaign. A player can reuse
-- the same character in every campaign and place it in any visible scene.
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null
    references public.app_users(firebase_uid) on delete cascade,
  name text not null,
  token_storage_path text not null unique,
  token_mime_type text,
  token_width integer,
  token_height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) > 0)
);

create unique index characters_owner_name_idx
  on public.characters(owner_user_id, lower(trim(name)));

create index characters_owner_idx
  on public.characters(owner_user_id);

alter table public.tokens
  add column character_id uuid
  references public.characters(id) on delete set null;

create index tokens_character_idx
  on public.tokens(character_id);

create trigger characters_set_updated_at
before update on public.characters
for each row execute function public.set_updated_at();

alter table public.characters enable row level security;

create function public.can_view_character(target_character_id uuid)
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
  );
$$;

create policy "Owners and scene viewers can read characters"
on public.characters
for select
to authenticated
using (public.can_view_character(id));

create policy "Users can create their own characters"
on public.characters
for insert
to authenticated
with check (owner_user_id = public.current_firebase_uid());

create policy "Users can update their own characters"
on public.characters
for update
to authenticated
using (owner_user_id = public.current_firebase_uid())
with check (owner_user_id = public.current_firebase_uid());

create policy "Users can delete their own characters"
on public.characters
for delete
to authenticated
using (owner_user_id = public.current_firebase_uid());

-- A token created from a character always remains controlled by that
-- character's owner. Masters can still move and edit it through the existing
-- campaign policies, but cannot accidentally detach its ownership.
create function public.enforce_character_token_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  character_owner text;
begin
  if new.character_id is null then
    return new;
  end if;

  select character.owner_user_id
  into character_owner
  from public.characters character
  where character.id = new.character_id;

  if character_owner is null then
    raise exception 'Character does not exist'
      using errcode = '23503';
  end if;

  new.owner_user_id = character_owner;
  return new;
end;
$$;

create trigger tokens_enforce_character_owner
before insert or update of character_id, owner_user_id on public.tokens
for each row execute function public.enforce_character_token_owner();

grant select, insert, update, delete on public.characters to authenticated;

create policy "Character viewers can read token images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vers-assets'
  and (storage.foldername(name))[1] = 'characters'
  and public.can_view_character(
    public.try_uuid((storage.foldername(name))[2])
  )
);

create policy "Character owners can upload token images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vers-assets'
  and (storage.foldername(name))[1] = 'characters'
  and exists (
    select 1
    from public.characters character
    where character.id =
      public.try_uuid((storage.foldername(name))[2])
      and character.owner_user_id = public.current_firebase_uid()
      and character.token_storage_path = name
  )
);

create policy "Character owners can update token images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vers-assets'
  and exists (
    select 1
    from public.characters character
    where character.id =
      public.try_uuid((storage.foldername(name))[2])
      and character.owner_user_id = public.current_firebase_uid()
  )
)
with check (
  bucket_id = 'vers-assets'
  and exists (
    select 1
    from public.characters character
    where character.id =
      public.try_uuid((storage.foldername(name))[2])
      and character.owner_user_id = public.current_firebase_uid()
      and character.token_storage_path = name
  )
);

create policy "Character owners can delete token images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vers-assets'
  and exists (
    select 1
    from public.characters character
    where character.id =
      public.try_uuid((storage.foldername(name))[2])
      and character.owner_user_id = public.current_firebase_uid()
  )
);

alter publication supabase_realtime add table public.characters;
