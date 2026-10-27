create policy "Campaign members can receive private broadcasts"
on realtime.messages
for select
to authenticated
using (
  split_part(realtime.topic(), ':', 1) = 'campaign'
  and public.is_campaign_member(
    public.try_uuid(split_part(realtime.topic(), ':', 2))
  )
);

create policy "Campaign members can send private broadcasts"
on realtime.messages
for insert
to authenticated
with check (
  split_part(realtime.topic(), ':', 1) = 'campaign'
  and public.is_campaign_member(
    public.try_uuid(split_part(realtime.topic(), ':', 2))
  )
);
