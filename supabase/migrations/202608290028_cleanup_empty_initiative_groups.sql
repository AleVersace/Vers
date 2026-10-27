-- Token deletions cascade to their initiative entries. When the last member of
-- a grouped initiative is deleted, remove the now-empty group as well.
create function public.cleanup_empty_initiative_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.group_entry_id is not null
    and not exists (
      select 1
      from public.initiative_entries member
      where member.group_entry_id = old.group_entry_id
    )
  then
    delete from public.initiative_entries entry
    where entry.id = old.group_entry_id
      and entry.token_id is null;
  end if;

  return old;
end;
$$;

revoke all on function public.cleanup_empty_initiative_group() from public;

create trigger initiative_entries_cleanup_empty_group
after delete on public.initiative_entries
for each row
when (old.group_entry_id is not null)
execute function public.cleanup_empty_initiative_group();
