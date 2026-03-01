-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Profiles table (just a name, no auth needed)
create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- Session state per profile
create table sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade unique,
  conversation_history jsonb default '[]'::jsonb,
  mastery_scores jsonb default '{}'::jsonb,
  level text default 'A1',
  turn integer default 0,
  updated_at timestamptz default now()
);

-- RLS: allow anon access (hackathon — no auth)
alter table profiles enable row level security;
alter table sessions enable row level security;

create policy "anon_profiles_select" on profiles for select using (true);
create policy "anon_profiles_insert" on profiles for insert with check (true);
create policy "anon_sessions_select" on sessions for select using (true);
create policy "anon_sessions_insert" on sessions for insert with check (true);
create policy "anon_sessions_update" on sessions for update using (true);

-- Seed two default profiles
insert into profiles (name) values ('Demo'), ('Main');
