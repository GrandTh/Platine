-- ============================================================
--  MIGRATION 09 — Graine de mélange (shuffle) de la file
--  L'hôte peut mélanger l'ordre des morceaux À 0 VOTE (issus des imports
--  de playlist). Les morceaux votés gardent la priorité (tri par votes).
--  Le seed est partagé : tous les clients trient les 0-vote de la même
--  façon (pseudo-aléatoire déterministe basé sur ce seed). Changer le seed
--  = nouveau mélange, propagé en temps réel.
--  À exécuter dans le SQL Editor de Supabase.
-- ============================================================

alter table public.rooms add column if not exists shuffle_seed text;
