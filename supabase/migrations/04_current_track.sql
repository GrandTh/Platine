-- ============================================================
--  MIGRATION 04 — Morceau actuellement en lecture (figé)
--  Le morceau en cours ne doit pas changer quand les votes
--  réordonnent la file : on le mémorise explicitement.
--  Géré par l'hôte ; lu par tous (réordonne seulement la suite).
--  À exécuter dans le SQL Editor de Supabase.
-- ============================================================

alter table public.rooms
  add column if not exists current_track_id uuid;
