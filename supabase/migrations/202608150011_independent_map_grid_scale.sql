-- Preserve the current rendered map width independently from the grid cell
-- size. Existing scenes keep exactly the same visual map dimensions after the
-- application starts treating grid_cell_px as grid granularity only.
alter table public.scenes
  add column map_width_px integer;

update public.scenes
set map_width_px = greatest(
  320,
  least(12000, grid_columns * grid_cell_px)
)
where map_width_px is null;

alter table public.scenes
  alter column map_width_px set default 2016,
  alter column map_width_px set not null;

alter table public.scenes
  add constraint scenes_map_width_px_range
  check (map_width_px between 320 and 12000);
