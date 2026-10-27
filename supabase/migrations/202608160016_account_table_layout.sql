-- Each account keeps its own tabletop workspace arrangement across campaigns
-- and devices. The client version field allows the shape to evolve safely.
alter table public.app_users
  add column table_layout jsonb not null default '{}'::jsonb;

alter table public.app_users
  add constraint app_users_table_layout_object check (
    jsonb_typeof(table_layout) = 'object'
  );

comment on column public.app_users.table_layout is
  'Versioned personal positions, sizes, stacking order, and collapsed state of tabletop panels.';
