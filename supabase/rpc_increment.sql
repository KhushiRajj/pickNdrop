create or replace function increment_download_count(link_id uuid, max_val int)
returns int
language plpgsql
as $$
declare
  new_count int;
begin
  update share_links
  set download_count = download_count + 1
  where id = link_id
    and (max_val is null or download_count < max_val)
  returning download_count into new_count;

  if not found then
    return -1;
  end if;

  return new_count;
end;
$$;
