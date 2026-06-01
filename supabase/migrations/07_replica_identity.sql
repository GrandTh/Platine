-- ============================================================
--  MIGRATION 07 — REPLICA IDENTITY FULL sur tracks & votes
--
--  Par défaut, les événements Realtime DELETE ne contiennent que la clé
--  primaire de la ligne supprimée. Du coup un abonnement filtré par
--  `room_id` (ou `track_id`) ne reçoit JAMAIS les DELETE → l'UI ne se
--  rafraîchit pas quand on retire un morceau / un vote (il fallait refresh).
--
--  REPLICA IDENTITY FULL fait inclure toute la ligne dans le payload DELETE
--  → le filtre matche et le retrait se propage en temps réel.
--  À exécuter dans le SQL Editor de Supabase.
-- ============================================================

alter table public.tracks replica identity full;
alter table public.votes  replica identity full;
