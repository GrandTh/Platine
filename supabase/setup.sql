-- ============================================================
--  PLATINE — Initialisation complète d'une base VIERGE
--  ------------------------------------------------------------
--  À copier-coller en une fois dans le SQL Editor de Supabase
--  pour initialiser un nouveau projet (ex. la base de DEV).
--
--  Équivaut à : schema.sql + migrations 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16.
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

-- rooms : insert RETIRÉ en anon (création via /api/room/ensure, service role).
create policy "rooms: anon read"   on public.rooms for select using (true);
create policy "rooms: anon update" on public.rooms for update using (true) with check (true);
create policy "rooms: anon delete" on public.rooms for delete using (true);
-- tracks : lecture seule en anon (écriture via /api/track/*, service role).
create policy "tracks: anon read" on public.tracks for select using (true);
-- votes : lecture seule en anon (toggle via /api/vote, service role).
create policy "votes: anon read"  on public.votes  for select using (true);


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
-- members : lecture seule en anon (écriture via /api/member*, service role).
create policy "members: anon read" on public.members for select using (true);


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
-- skip_votes : lecture seule en anon (toggle via /api/skip-vote, service role).
create policy "skip_votes: anon read" on public.skip_votes for select using (true);


-- ============================================================
--  6) MORCEAUX POPULAIRES — compteur persistant (migration 10)
-- ============================================================

create table if not exists public.popular_tracks (
  source        text not null,
  external_id   text not null,
  title         text not null default '',
  artist        text not null default '',
  cover         text not null default '',
  add_count     integer not null default 0,
  last_added_at timestamptz not null default now(),
  primary key (source, external_id)
);

create index if not exists popular_tracks_count_idx
  on public.popular_tracks (add_count desc);

create or replace function public.bump_popular_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.popular_tracks (source, external_id, title, artist, cover, add_count, last_added_at)
  values (new.source, new.external_id, new.title, coalesce(new.artist, ''), coalesce(new.cover, ''), 1, now())
  on conflict (source, external_id) do update
    set add_count     = public.popular_tracks.add_count + 1,
        last_added_at = now(),
        title  = excluded.title,
        artist = excluded.artist,
        cover  = excluded.cover;
  return new;
end;
$$;

drop trigger if exists trg_bump_popular on public.tracks;
create trigger trg_bump_popular
  after insert on public.tracks
  for each row execute function public.bump_popular_track();

alter table public.popular_tracks enable row level security;
create policy "popular_tracks: anon read"
  on public.popular_tracks for select using (true);


-- ============================================================
--  7) CACHE DU CONTENU DES PLAYLISTS (migration 11)
-- ============================================================

create table if not exists public.playlist_cache (
  playlist_id text primary key,
  tracks      jsonb not null,
  cached_at   timestamptz not null default now()
);

alter table public.playlist_cache enable row level security;
create policy "playlist_cache: anon all"
  on public.playlist_cache for all using (true) with check (true);
-- Cron de nettoyage optionnel (pg_cron) — voir migration 11 pour le détail.


-- ============================================================
--  8) PLAYLISTS RECOMMANDÉES — chips de l'onglet recherche (migration 12)
-- ============================================================

create table if not exists public.recommended_playlists (
  playlist_id text primary key,
  label       text not null,
  position    integer not null default 0,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.recommended_playlists enable row level security;
create policy "recommended_playlists: anon read"
  on public.recommended_playlists for select using (true);

insert into public.recommended_playlists (playlist_id, label, position) values
  ('PL4fGSI1pDJn7bK3y1Hx-qpHBqfr6cesNs',          'Top 100 France', 1),
  ('RDCLAK5uy_nWufZ3-rH924TsgmroKWiilEk-BQweReI', 'Années 80',      2),
  ('RDCLAK5uy_nmS3YoxSwVVQk9lEQJ0UX4ZCjXsW_psU8', 'Pop',            3),
  ('RDCLAK5uy_n64_P7t3MmbTu7jziSk48DL',           'Techno',         4),
  ('RDCLAK5uy_lBGRuQnsG37Akr1CY4SxL0VWFbPrbO4gs', 'Rap',            5)
on conflict (playlist_id) do nothing;


-- ============================================================
--  9) RATE LIMIT — anti-abus recherche (migration 13)
-- ============================================================

create table if not exists public.rate_limit (
  bucket     text primary key,
  count      integer not null default 0,
  expires_at timestamptz not null
);

create index if not exists rate_limit_expires_idx on public.rate_limit (expires_at);

create or replace function public.rl_hit(p_bucket text, p_ttl_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c integer;
begin
  delete from public.rate_limit where expires_at < now();
  insert into public.rate_limit (bucket, count, expires_at)
  values (p_bucket, 1, now() + make_interval(secs => p_ttl_seconds))
  on conflict (bucket) do update set count = public.rate_limit.count + 1
  returning count into c;
  return c <= p_limit;
end;
$$;

alter table public.rate_limit enable row level security;
