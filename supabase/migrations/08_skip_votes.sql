-- ============================================================
--  MIGRATION 08 — Votes pour skip le morceau en cours
--  Les invités peuvent voter pour passer le morceau ; à 50% des invités
--  présents (arrondi sup.), il est skippé automatiquement.
--  Un vote par personne et par morceau. Le cascade depuis tracks nettoie
--  automatiquement les votes quand le morceau est retiré (skip / fin).
--  À exécuter dans le SQL Editor de Supabase.
-- ============================================================

create table if not exists public.skip_votes (
  room_id    text not null references public.rooms (id) on delete cascade,
  track_id   uuid not null references public.tracks (id) on delete cascade,
  voter_id   text not null,                         -- id anonyme
  created_at timestamptz not null default now(),
  primary key (track_id, voter_id)
);

create index if not exists skip_votes_room_idx on public.skip_votes (room_id);

-- Realtime : la progression du vote se met à jour en direct.
alter publication supabase_realtime add table public.skip_votes;
-- DELETE filtrés par room_id → REPLICA IDENTITY FULL (sinon le filtre rate
-- les suppressions, comme pour tracks/votes en migration 07).
alter table public.skip_votes replica identity full;

-- RLS (prototype) : accès anon total.
alter table public.skip_votes enable row level security;
create policy "skip_votes: anon full access" on public.skip_votes for all using (true) with check (true);
