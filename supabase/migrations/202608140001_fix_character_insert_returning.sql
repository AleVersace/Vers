-- INSERT ... RETURNING also evaluates the SELECT policy. During the same
-- statement, the stable can_view_character() lookup cannot see the row that is
-- still being inserted. Check direct ownership from the candidate row first;
-- scene viewers continue to use the existing visibility function.
alter policy "Owners and scene viewers can read characters"
on public.characters
using (
  owner_user_id = public.current_firebase_uid()
  or public.can_view_character(id)
);
