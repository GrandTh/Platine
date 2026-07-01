-- Migration 24 : annonces admin (« god mode »).
--
-- L'admin pousse un message overlay dans une room. Pour que ce soit
-- INFALSIFIABLE (un client malveillant ne doit pas pouvoir simuler une annonce
-- admin), on passe par une table : écriture RÉSERVÉE au service role (endpoint
-- admin), lecture anon pour le Realtime. Les clients affichent l'overlay sur
-- l'INSERT (postgres_changes).

create table if not exists public.announcements (
  id        uuid primary key default gen_random_uuid(),
  room_id   text not null references public.rooms (id) on delete cascade,
  message   text not null,
  created_at timestamptz not null default now()
);

create index if not exists announcements_room_idx on public.announcements (room_id, created_at desc);

alter publication supabase_realtime add table public.announcements;

alter table public.announcements enable row level security;
-- Lecture anon (nécessaire au Realtime) ; AUCUNE écriture anon (service role only).
create policy "announcements: anon read" on public.announcements for select using (true);
