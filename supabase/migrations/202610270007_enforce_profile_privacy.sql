-- Apply after deploying the client that uses list_campaign_members.
drop policy "Authenticated users can read profiles" on public.app_users;
create policy "Users can read their own profile" on public.app_users
for select to authenticated using (firebase_uid = public.current_firebase_uid());
