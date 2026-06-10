-- ============================================================
--  MIGRATION 11 — Cache du contenu des playlists
--
--  Cliquer une playlist recommandée (ou coller un lien playlist) appelle
--  /api/playlist → playlistItems.list (1 unité / 50 titres). Pour éviter de
--  refetch à CHAQUE visite, on mémorise le contenu par playlist :
--    - 1er utilisateur → fetch YouTube + écrit ici.
--    - suivants → lecture depuis la DB (0 unité, instantané).
--
--  Rafraîchissement : garde-fou TTL 24 h côté serveur + (optionnel) un cron
--  pg_cron qui VIDE la table chaque nuit → contenu refait le lendemain.
--  Le cron ne fait qu'un DELETE SQL pur (aucune clé API en base).
--
--  À exécuter dans le SQL Editor de Supabase (prod) — déjà appliqué en local.
-- ============================================================

create table if not exists public.playlist_cache (
  playlist_id text primary key,         -- ID de playlist YouTube (param `list=`)
  tracks      jsonb not null,            -- tableau de PlaylistTrack sérialisé
  cached_at   timestamptz not null default now()
);

-- RLS : accès anon (prototype). L'écriture passe par la route serveur Nuxt.
alter table public.playlist_cache enable row level security;
create policy "playlist_cache: anon all"
  on public.playlist_cache for all using (true) with check (true);

-- ────────────────────────────────────────────────────────────────────────
--  Cron de nettoyage quotidien (OPTIONNEL — pré-requis : extension pg_cron).
--  Sur Supabase Cloud : Dashboard → Database → Extensions → activer "pg_cron".
--  Puis exécuter (une seule fois) :
--
--    select cron.schedule(
--      'clean-playlist-cache',
--      '0 0 * * *',                      -- tous les jours à minuit (UTC)
--      $$ delete from public.playlist_cache $$
--    );
--
--  Pour le supprimer : select cron.unschedule('clean-playlist-cache');
--  Note : l'heure est en UTC. Pour ~minuit Paris, utiliser '0 23 * * *'.
--  Inutile pour la correction (le TTL 24 h suffit) — c'est juste du ménage.
-- ────────────────────────────────────────────────────────────────────────
