-- Token placement is shared with everyone who can see the scene, while combat
-- statistics are private to the token controller and campaign masters.
create table public.token_stats (
  token_id uuid primary key
    references public.tokens(id) on delete cascade,
  hp_current numeric,
  hp_max numeric,
  armor_class smallint,
  difficulty_class smallint,
  saving_throws jsonb,
  speed_ft numeric,
  notes text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hp_current is null or hp_current >= 0),
  check (hp_max is null or hp_max > 0),
  check (
    hp_current is null
    or hp_max is null
    or hp_current <= hp_max
  )
);

insert into public.token_stats (
  token_id,
  hp_current,
  hp_max,
  armor_class,
  difficulty_class,
  saving_throws,
  speed_ft,
  notes,
  metadata,
  created_at,
  updated_at
)
select
  id,
  hp_current,
  hp_max,
  armor_class,
  difficulty_class,
  saving_throws,
  speed_ft,
  notes,
  metadata,
  created_at,
  updated_at
from public.tokens;

create trigger token_stats_set_updated_at
before update on public.token_stats
for each row execute function public.set_updated_at();

alter table public.token_stats enable row level security;

create function public.can_view_token_stats(target_token_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tokens token
    where token.id = target_token_id
      and (
        token.owner_user_id = public.current_firebase_uid()
        or public.is_campaign_master(
          public.scene_campaign_id(token.scene_id)
        )
      )
  );
$$;

revoke all on function public.can_view_token_stats(uuid) from public;
grant execute on function public.can_view_token_stats(uuid) to authenticated;

create policy "Controllers can read token stats"
on public.token_stats
for select
to authenticated
using (public.can_view_token_stats(token_id));

create policy "Controllers can create token stats"
on public.token_stats
for insert
to authenticated
with check (public.can_view_token_stats(token_id));

create policy "Controllers can update token stats"
on public.token_stats
for update
to authenticated
using (public.can_view_token_stats(token_id))
with check (public.can_view_token_stats(token_id));

create policy "Controllers can delete token stats"
on public.token_stats
for delete
to authenticated
using (public.can_view_token_stats(token_id));

grant select, insert, update, delete on public.token_stats to authenticated;

alter publication supabase_realtime add table public.token_stats;

alter table public.tokens
  drop column hp_current,
  drop column hp_max,
  drop column armor_class,
  drop column difficulty_class,
  drop column saving_throws,
  drop column speed_ft,
  drop column notes,
  drop column metadata;
