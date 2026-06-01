-- ============================================================
--  MIGRATION 03 — État lecture/pause partagé de la room
--  `playing` est partagé en temps réel : pause/play se répercute
--  sur tous les clients (et pilote l'inertie du vinyle).
--  À exécuter dans le SQL Editor de Supabase.
-- ============================================================

alter table public.rooms
  add column if not exists playing boolean not null default true;
