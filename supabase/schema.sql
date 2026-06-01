-- ============================================================
--  PLATINE — Schéma Supabase (Phase 2)
--  Rooms éphémères + file de morceaux + votes.
--  À exécuter dans l'éditeur SQL de Supabase.
-- ============================================================

-- ---------- Tables ----------

-- Rooms : identifiées par un code court, supprimées quand l'hôte part.
-- `host_last_seen` est rafraîchi par un heartbeat ; un refresh ne supprime
-- donc pas la room (l'hôte se reconnecte avant l'expiration du délai de grâce).
-- `last_active` est rafraîchi par TOUS les participants (hôte + invités).
-- La room vit tant qu'au moins une personne heartbeate ; quand plus personne
-- n'est présent, elle devient « vide » et le cleanup la supprime.
create table if not exists public.rooms (
  id          text primary key,                    -- le code (ex. "AB23CD")
  host_id     text not null,                       -- id anonyme du créateur (permissions)
  source      text not null default 'youtube'
                check (source in ('youtube', 'both')),
  mode        text not null default 'each'
                check (mode in ('speaker', 'each')),
  playing     boolean not null default true,
  last_active timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- Morceaux dans la file.
create table if not exists public.tracks (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null references public.rooms (id) on delete cascade,
  title       text not null,
  artist      text not null default '',
  cover       text not null default '',
  source      text not null check (source in ('youtube', 'spotify')),
  external_id text not null,                        -- videoId YouTube / uri Spotify
  added_by    text not null,                        -- id anonyme
  played      boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists tracks_room_idx on public.tracks (room_id);

-- Votes : un vote par utilisateur anonyme et par morceau.
create table if not exists public.votes (
  track_id   uuid not null references public.tracks (id) on delete cascade,
  voter_id   text not null,                         -- id anonyme
  created_at timestamptz not null default now(),
  primary key (track_id, voter_id)
);

-- ---------- Realtime ----------
-- Diffuse les changements de ces tables aux clients abonnés.
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.tracks;
alter publication supabase_realtime add table public.votes;

-- ---------- Nettoyage des rooms vides ----------
-- Supprime les rooms que plus personne ne maintient en vie : aucun participant
-- (hôte ou invité) n'a heartbeaté `last_active` depuis le délai de grâce.
-- Le cron n'est qu'un filet de sécurité → une fréquence horaire suffit
-- (une room vide qui traîne quelques minutes de plus est sans conséquence).
--
-- À planifier via pg_cron, toutes les heures :
--   select cron.schedule('platine-cleanup', '0 * * * *',
--     $$ select public.cleanup_stale_rooms(); $$);
create or replace function public.cleanup_stale_rooms()
returns void
language sql
as $$
  delete from public.rooms
  where last_active < now() - interval '5 minutes';
$$;

-- ---------- RLS (prototype) ----------
-- ⚠️ Niveau prototype : accès anonyme total (invités sans compte).
-- À durcir en prod (ex. via Edge Functions validant l'appartenance à la room,
-- ou un secret de room signé). Ne pas laisser tel quel en production.
alter table public.rooms  enable row level security;
alter table public.tracks enable row level security;
alter table public.votes  enable row level security;

create policy "rooms: anon full access"  on public.rooms  for all using (true) with check (true);
create policy "tracks: anon full access" on public.tracks for all using (true) with check (true);
create policy "votes: anon full access"  on public.votes  for all using (true) with check (true);
