-- ============================================================
--  MIGRATION 06 — Membres d'une room
--  Liste des participants (présence via last_seen) + nom personnalisable.
--  La couleur n'est PAS stockée : elle est dérivée de l'uid côté client
--  (déterministe) → la bordure d'un morceau garde sa couleur même si
--  l'auteur a quitté la room.
--  À exécuter dans le SQL Editor de Supabase.
-- ============================================================

create table if not exists public.members (
  room_id   text not null references public.rooms (id) on delete cascade,
  uid       text not null,                       -- id anonyme du participant
  name      text,                                -- nom choisi (null → ID affiché)
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (room_id, uid)
);

create index if not exists members_room_idx on public.members (room_id);

-- Realtime : la liste des membres se met à jour en direct.
alter publication supabase_realtime add table public.members;

-- RLS (prototype) : accès anon total.
alter table public.members enable row level security;
create policy "members: anon full access" on public.members for all using (true) with check (true);
