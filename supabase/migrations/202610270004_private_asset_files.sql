-- Storage must enforce the same visibility as asset metadata. Masters also
-- need access before metadata creation and after metadata deletion for uploads
-- and cleanup. Character images retain their separate character policies.
alter policy "Campaign members can read assets" on storage.objects
using (
  bucket_id = 'vers-assets' and (
    public.is_campaign_master(public.try_uuid((storage.foldername(name))[1]))
    or exists (
      select 1 from public.assets asset
      where asset.storage_path = storage.objects.name
    )
  )
);
