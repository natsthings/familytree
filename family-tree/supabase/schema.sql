-- Run this in your Supabase SQL Editor

-- Members table: stores each person in the family tree
create table public.members (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  birth_year int,
  death_year int,
  notes text,
  photo_url text,
  is_root boolean default false, -- marks "you" (the tree owner)
  position_x float default 0,
  position_y float default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Relationships table: connects members
create table public.relationships (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  source_id uuid references public.members(id) on delete cascade not null,
  target_id uuid references public.members(id) on delete cascade not null,
  relation_type text not null check (relation_type in (
    'parent', 'child', 'spouse', 'sibling', 'other'
  )),
  label text, -- optional custom label e.g. "step-father", "adoptive mother"
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.members enable row level security;
alter table public.relationships enable row level security;

-- Policies: users can only see/edit their own data
create policy "Users can manage their own members"
  on public.members for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own relationships"
  on public.relationships for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger members_updated_at
  before update on public.members
  for each row execute function update_updated_at();
