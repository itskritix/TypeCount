-- 1. Create the user_typing_data table
create table if not exists public.user_typing_data (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  device_id text not null,
  device_name text,
  
  -- Data Fields
  total_keystrokes bigint default 0,
  daily_keystrokes jsonb default '{}'::jsonb,
  hourly_keystrokes jsonb default '{}'::jsonb,
  achievements jsonb default '[]'::jsonb,
  challenges jsonb default '[]'::jsonb,
  goals jsonb default '[]'::jsonb,
  
  -- Stats
  user_level int default 1,
  user_xp bigint default 0,
  personality_type text,
  streak_days int default 0,
  longest_streak int default 0,
  
  -- Meta
  first_used_date timestamptz,
  last_updated timestamptz default now(),
  created_at timestamptz default now(),

  -- Constraint: One record per device per user
  unique(user_id, device_id)
);

-- 2. Enable RLS
alter table public.user_typing_data enable row level security;

-- 3. Create Policy: Users can do ANYTHING to their own rows
create policy "Enable all access for users based on user_id"
on public.user_typing_data
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 4. Create Index for performance
create index if not exists idx_user_typing_data_user_id on public.user_typing_data(user_id);