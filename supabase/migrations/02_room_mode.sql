-- ============================================================
--  MIGRATION 02 — Mode d'écoute de la room
--  'speaker' = une seule enceinte (l'hôte), invités en muet
--  'each'    = son sur chaque appareil (synchronisé)
--  À exécuter dans le SQL Editor de Supabase.
-- ============================================================

alter table public.rooms
  add column if not exists mode text not null default 'each'
    check (mode in ('speaker', 'each'));
