-- Keep the Google identity as the authentication source while allowing each
-- user to choose how they are presented inside VERS.
alter table public.app_users
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists nickname text;

alter table public.app_users
  add constraint app_users_first_name_length
    check (first_name is null or char_length(first_name) <= 80),
  add constraint app_users_last_name_length
    check (last_name is null or char_length(last_name) <= 80),
  add constraint app_users_nickname_length
    check (nickname is null or char_length(nickname) <= 40);
