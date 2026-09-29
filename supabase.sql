-- CampManager Familien-Synchronisierung (Supabase)
-- Einmal im Supabase SQL Editor ausführen.

create table if not exists public.camp_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.camp_states enable row level security;

drop policy if exists "camp_select_own" on public.camp_states;
create policy "camp_select_own" on public.camp_states
for select using (auth.uid() = user_id);

drop policy if exists "camp_insert_own" on public.camp_states;
create policy "camp_insert_own" on public.camp_states
for insert with check (auth.uid() = user_id);

drop policy if exists "camp_update_own" on public.camp_states;
create policy "camp_update_own" on public.camp_states
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "camp_delete_own" on public.camp_states;
create policy "camp_delete_own" on public.camp_states
for delete using (auth.uid() = user_id);
