-- Med Andra Ord - Supabase Realtime setup
-- Kor detta en gang i Supabase SQL Editor for projektet.
-- Denna version ar avsedd for forsta setupen och tar inte bort nagot.

create table if not exists public.mao_rooms (
  room_code text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.mao_rooms enable row level security;
alter table public.mao_rooms replica identity full;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.mao_rooms to anon, authenticated;

create policy "mao rooms are readable"
on public.mao_rooms
for select
to anon, authenticated
using (true);

create policy "mao rooms can be created"
on public.mao_rooms
for insert
to anon, authenticated
with check (true);

create policy "mao rooms can be updated"
on public.mao_rooms
for update
to anon, authenticated
using (true)
with check (true);

alter publication supabase_realtime add table public.mao_rooms;
