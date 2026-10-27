-- Each placed prop rotates independently around its center. Values stay in a
-- normalized degree range so clients can render and edit them consistently.
alter table public.scene_assets
  add column rotation numeric not null default 0
  check (rotation >= 0 and rotation < 360);
