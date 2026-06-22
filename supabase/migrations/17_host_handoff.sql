-- Passation d'hôte (host handoff).
--
-- On distingue désormais :
--   owner_id : le CRÉATEUR de la room (immuable). Le rôle d'hôte lui revient
--              toujours dès qu'il est présent.
--   host_id  : l'hôte ACTIF (ce que le client lit pour `isHost`). Peut basculer
--              vers un invité quand le propriétaire est absent depuis > 3 min.
--   host_absent_since : début d'absence du propriétaire (chrono de la grâce).
--
-- Additif et rétro-compatible (colonnes nullables) → à jouer AVANT le déploiement
-- du code (l'insert de room écrit owner_id).
alter table public.rooms add column if not exists owner_id text;
alter table public.rooms add column if not exists host_absent_since timestamptz;

-- Rooms existantes : le propriétaire est l'hôte courant.
update public.rooms set owner_id = host_id where owner_id is null;
