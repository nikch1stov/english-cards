-- One row per user with the whole app state (progress, daily history, settings).
create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "read own state" on public.user_state;
create policy "read own state" on public.user_state
  for select using (auth.uid() = user_id);

drop policy if exists "insert own state" on public.user_state;
create policy "insert own state" on public.user_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own state" on public.user_state;
create policy "update own state" on public.user_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cap one user's state at 1 MB so a bug or abuse cannot fill the database.
-- A real account (500 words, 1000 own words, years of history) stays well under 300 KB.
alter table public.user_state drop constraint if exists state_size;
alter table public.user_state add constraint state_size
  check (octet_length(state::text) <= 1000000);
