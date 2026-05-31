-- ============================================================
--  MIGRATION 01 — Room « vivante tant qu'elle n'est pas vide »
--  À exécuter dans le SQL Editor de Supabase sur une base ayant
--  déjà reçu schema.sql (colonne host_last_seen existante).
-- ============================================================

-- 1) Renomme la colonne : ce n'est plus « l'hôte vu » mais « la dernière
--    activité de n'importe quel participant ».
alter table public.rooms
  rename column host_last_seen to last_active;

-- 2) Le cleanup supprime désormais les rooms inactives (= vides) depuis 5 min.
create or replace function public.cleanup_stale_rooms()
returns void
language sql
as $$
  delete from public.rooms
  where last_active < now() - interval '5 minutes';
$$;

-- 3) (Re)planifie le cron en horaire. Décommente après avoir activé
--    l'extension pg_cron (Database → Extensions → pg_cron).
--
--    -- supprime l'ancienne planification si elle existait :
--    select cron.unschedule('platine-cleanup');
--    -- nouvelle planification, toutes les heures :
--    select cron.schedule('platine-cleanup', '0 * * * *',
--      $$ select public.cleanup_stale_rooms(); $$);
