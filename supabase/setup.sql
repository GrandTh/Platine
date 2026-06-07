-- ============================================================
--  PLATINE — Initialisation complète d'une base VIERGE
--  ------------------------------------------------------------
--  À copier-coller en une fois dans le SQL Editor de Supabase
--  pour initialiser un nouveau projet (ex. la base de DEV).
--
--  Équivaut à : schema.sql + migrations 05, 06, 07, 08.
--  (Les migrations 01→04 sont déjà intégrées dans le schéma ci-dessous,
--   donc inutile de les rejouer — la 01 échouerait sur une base neuve.)
--
--  Idempotent : peut être relancé sans casser (if not exists / or replace).
-- ============================================================


-- ============================================================
--  1) SCHÉMA DE BASE — rooms / tracks / votes
-- ============================================================

-- Rooms : identifiées par un code court, supprimées quand plus personne n'est là.
create table if not exists public.rooms (
  id          text primary key,                    -- le code (ex. "AB23CD")
  host_id     text not null,                       -- id anonyme du créateur (permissions)
  source      text not null default 'youtube'
                check (source in ('youtube', 'both')),
  mode        text not null default 'each'
                check (mode in ('speaker', 'each')),
  playing     boolean not null default true,
  current_track_id uuid,                             -- morceau en lecture (figé)
  shuffle_seed text,                                 -- graine de mélange des 0-vote
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

-- Realtime
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.tracks;
alter publication supabase_realtime add table public.votes;

-- Nettoyage des rooms vides (inactives depuis 5 min).
-- À planifier via pg_cron (toutes les heures) :
--   select cron.schedule('platine-cleanup', '0 * * * *',
--     $$ select public.cleanup_stale_rooms(); $$);
create or replace function public.cleanup_stale_rooms()
returns void
language sql
as $$
  delete from public.rooms
  where last_active < now() - interval '5 minutes';
$$;

-- RLS (prototype) : accès anon total.
alter table public.rooms  enable row level security;
alter table public.tracks enable row level security;
alter table public.votes  enable row level security;

create policy "rooms: anon full access"  on public.rooms  for all using (true) with check (true);
create policy "tracks: anon full access" on public.tracks for all using (true) with check (true);
create policy "votes: anon full access"  on public.votes  for all using (true) with check (true);


-- ============================================================
--  2) CACHE DES RECHERCHES YOUTUBE (migration 05)
-- ============================================================

create table if not exists public.search_cache (
  q          text primary key,          -- requête normalisée (trim + lowercase)
  results    jsonb not null,            -- tableau de résultats sérialisés
  created_at timestamptz not null default now()
);

alter table public.search_cache enable row level security;
create policy "search_cache: anon read"  on public.search_cache for select using (true);
create policy "search_cache: anon write" on public.search_cache for insert with check (true);


-- ============================================================
--  3) MEMBRES D'UNE ROOM (migration 06)
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

alter publication supabase_realtime add table public.members;

alter table public.members enable row level security;
create policy "members: anon full access" on public.members for all using (true) with check (true);


-- ============================================================
--  4) REPLICA IDENTITY FULL — DELETE filtrés en Realtime (migration 07)
-- ============================================================

alter table public.tracks replica identity full;
alter table public.votes  replica identity full;


-- ============================================================
--  5) VOTES POUR PASSER LE MORCEAU (migration 08)
-- ============================================================

create table if not exists public.skip_votes (
  room_id    text not null references public.rooms (id) on delete cascade,
  track_id   uuid not null references public.tracks (id) on delete cascade,
  voter_id   text not null,                         -- id anonyme
  created_at timestamptz not null default now(),
  primary key (track_id, voter_id)
);

create index if not exists skip_votes_room_idx on public.skip_votes (room_id);

alter publication supabase_realtime add table public.skip_votes;
alter table public.skip_votes replica identity full;

alter table public.skip_votes enable row level security;
create policy "skip_votes: anon full access" on public.skip_votes for all using (true) with check (true);
