-- Explicit setup for a new installation. Only a server-side service key or a
-- database administrator can call this; no default users or invites are shipped.
create function public.initialize_installation(project_id text, master_email text, campaign_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_campaign uuid := gen_random_uuid();
  new_scene uuid := gen_random_uuid();
begin
  if exists (select 1 from public.campaigns) then
    raise exception 'Installation already contains campaigns; use configure_firebase_auth for an upgrade';
  end if;
  if master_email is null or master_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or campaign_name is null or length(trim(campaign_name)) not between 1 and 120 then
    raise exception 'A valid master email and campaign name are required';
  end if;
  perform public.configure_firebase_auth(project_id);
  insert into public.app_users(firebase_uid,display_name) values('system:vers','VERS')
    on conflict (firebase_uid) do nothing;
  insert into public.campaigns(id,name,created_by_uid) values(new_campaign,trim(campaign_name),'system:vers');
  insert into public.scenes(id,campaign_id,name,fog_enabled) values(new_scene,new_campaign,'Scena 1',false);
  update public.campaigns set player_scene_id=new_scene where id=new_campaign;
  insert into public.campaign_access_grants(campaign_id,email,role)
    values(new_campaign,lower(trim(master_email)),'master');
  return new_campaign;
end;
$$;
revoke all on function public.initialize_installation(text,text,text) from public, anon, authenticated;
grant execute on function public.initialize_installation(text,text,text) to service_role;
