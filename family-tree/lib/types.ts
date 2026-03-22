-- Drop ALL versions of this function
drop function if exists public.update_member_details(uuid,text,text,text,text,int,int,jsonb);
drop function if exists public.update_member_details(uuid,text,text,text,text,int,int,jsonb,boolean);
drop function if exists public.update_member_details(uuid,text,text,text,text,int,int,jsonb,boolean,text[]);
drop function if exists public.update_member_details(uuid,text,text,text,text,int,int,jsonb,boolean,text[],text);
drop function if exists public.update_member_details(uuid,text,text,text,text,int,int,jsonb,boolean,text[],text,text,text,text,text);
drop function if exists public.update_member_details(uuid,text,text,text,text,int,int,jsonb,boolean,text[],text,text,text,text,text,jsonb);

-- Add any missing columns
alter table public.members add column if not exists biography text;
alter table public.members add column if not exists birthplace text;
alter table public.members add column if not exists deathplace text;
alter table public.members add column if not exists familysearch_id text;
alter table public.members add column if not exists grave_location text;
alter table public.members add column if not exists source_links jsonb default '[]';
alter table public.members add column if not exists origins text[] default '{}';
alter table public.members add column if not exists is_deceased boolean default false;

-- Create clean single version
create function update_member_details(
  p_member_id uuid,
  p_name text,
  p_photo_url text,
  p_birth_date text,
  p_death_date text,
  p_birth_year int,
  p_death_year int,
  p_social_links jsonb,
  p_is_deceased boolean default false,
  p_origins text[] default '{}',
  p_biography text default null,
  p_birthplace text default null,
  p_deathplace text default null,
  p_familysearch_id text default null,
  p_grave_location text default null,
  p_source_links jsonb default '[]'
) returns void language plpgsql security definer as $$
begin
  update members set
    name = p_name,
    photo_url = p_photo_url,
    birth_date = case when p_birth_date is null or p_birth_date = '' then null else p_birth_date::date end,
    death_date = case when p_death_date is null or p_death_date = '' then null else p_death_date::date end,
    birth_year = p_birth_year,
    death_year = p_death_year,
    social_links = p_social_links,
    is_deceased = p_is_deceased,
    origins = p_origins,
    biography = p_biography,
    birthplace = p_birthplace,
    deathplace = p_deathplace,
    familysearch_id = p_familysearch_id,
    grave_location = p_grave_location,
    source_links = p_source_links
  where id = p_member_id;
end;
$$;

-- Personal events stored as jsonb array on members
alter table public.members add column if not exists personal_events jsonb default '[]';

-- Update RPC to include personal_events
drop function if exists public.update_member_details(uuid,text,text,text,text,int,int,jsonb,boolean,text[],text,text,text,text,text,jsonb);

create or replace function update_member_details(
  p_member_id uuid,
  p_name text,
  p_photo_url text,
  p_birth_date text,
  p_death_date text,
  p_birth_year int,
  p_death_year int,
  p_social_links jsonb,
  p_is_deceased boolean default false,
  p_origins text[] default '{}',
  p_biography text default null,
  p_birthplace text default null,
  p_deathplace text default null,
  p_familysearch_id text default null,
  p_grave_location text default null,
  p_source_links jsonb default '[]',
  p_personal_events jsonb default '[]'
) returns void language plpgsql security definer as $$
begin
  update members set
    name = p_name,
    photo_url = p_photo_url,
    birth_date = case when p_birth_date is null or p_birth_date = '' then null else p_birth_date::date end,
    death_date = case when p_death_date is null or p_death_date = '' then null else p_death_date::date end,
    birth_year = p_birth_year,
    death_year = p_death_year,
    social_links = p_social_links,
    is_deceased = p_is_deceased,
    origins = p_origins,
    biography = p_biography,
    birthplace = p_birthplace,
    deathplace = p_deathplace,
    familysearch_id = p_familysearch_id,
    grave_location = p_grave_location,
    source_links = p_source_links,
    personal_events = p_personal_events
  where id = p_member_id;
end;
$$;
