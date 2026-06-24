-- Durée des morceaux + autoplay de room.
--
--   tracks.duration   : durée du morceau en SECONDES (récupérée via videos.list,
--                       mise en cache → permet d'afficher le temps total de la file).
--   rooms.autoplay    : si true, quand la file se vide, l'hôte ré-enfile des
--                       morceaux populaires (la musique ne s'arrête jamais).
--
-- Additif et rétro-compatible (colonnes nullables / défaut) → à jouer AVANT le
-- déploiement du code (le code écrit ces colonnes).
alter table public.tracks add column if not exists duration integer;
alter table public.rooms  add column if not exists autoplay boolean not null default false;
