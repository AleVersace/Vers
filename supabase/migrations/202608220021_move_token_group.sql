-- Move a controlled set of tokens in one transaction. Every token must belong
-- to the requested scene, be unlocked, and be controlled by the caller (or by
-- a campaign Master). A failed validation leaves the whole group untouched.
create or replace function public.move_token_group(
  p_scene_id uuid,
  p_positions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_count integer;
  locked_count integer := 0;
  scene_columns integer;
  scene_rows integer;
  target_token record;
begin
  if jsonb_typeof(p_positions) <> 'array' then
    raise exception 'Token positions must be a JSON array';
  end if;

  requested_count := jsonb_array_length(p_positions);
  if requested_count < 1 or requested_count > 100 then
    raise exception 'A token group must contain between 1 and 100 tokens';
  end if;

  if not public.can_view_scene(p_scene_id) then
    raise exception 'Scene is not available to this user'
      using errcode = '42501';
  end if;

  select scene.grid_columns, scene.grid_rows
  into scene_columns, scene_rows
  from public.scenes scene
  where scene.id = p_scene_id;

  if not found then
    raise exception 'Scene does not exist';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_positions) as position(
      id uuid,
      x numeric,
      y numeric
    )
    where position.id is null
      or position.x is null
      or position.y is null
      or position.x < 0
      or position.y < 0
      or position.x <> trunc(position.x)
      or position.y <> trunc(position.y)
  ) then
    raise exception 'Token positions are invalid';
  end if;

  if (
    select count(distinct position.id)
    from jsonb_to_recordset(p_positions) as position(
      id uuid,
      x numeric,
      y numeric
    )
  ) <> requested_count then
    raise exception 'Token group contains duplicate ids';
  end if;

  for target_token in
    select
      token.*,
      position.x as requested_x,
      position.y as requested_y
    from public.tokens token
    join jsonb_to_recordset(p_positions) as position(
      id uuid,
      x numeric,
      y numeric
    ) on position.id = token.id
    order by token.id
    for update of token
  loop
    locked_count := locked_count + 1;

    if target_token.scene_id <> p_scene_id then
      raise exception 'A token belongs to a different scene';
    end if;

    if target_token.locked then
      raise exception 'A locked token cannot be moved';
    end if;

    if target_token.requested_x + target_token.size > scene_columns
      or target_token.requested_y + target_token.size > scene_rows
    then
      raise exception 'A selected token would leave the scene grid';
    end if;

    if not (
      public.is_campaign_master(public.scene_campaign_id(target_token.scene_id))
      or target_token.owner_user_id = public.current_firebase_uid()
    ) then
      raise exception 'Not allowed to move one or more selected tokens'
        using errcode = '42501';
    end if;
  end loop;

  if locked_count <> requested_count then
    raise exception 'One or more selected tokens do not exist';
  end if;

  update public.tokens token
  set
    x = position.x,
    y = position.y
  from jsonb_to_recordset(p_positions) as position(
    id uuid,
    x numeric,
    y numeric
  )
  where token.id = position.id
    and token.scene_id = p_scene_id;
end;
$$;

revoke all on function public.move_token_group(uuid, jsonb) from public;
grant execute on function public.move_token_group(uuid, jsonb) to authenticated;
