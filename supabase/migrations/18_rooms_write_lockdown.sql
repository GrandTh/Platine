-- Verrouillage des écritures `rooms` en anon.
--
-- Toutes les écritures sur `rooms` passent désormais par des endpoints service
-- role : création (/api/room/ensure), état de lecture (/api/room/state, hôte
-- only), heartbeat `last_active` (/api/member), passation d'hôte (reconcileHost).
-- On retire donc les policies update/delete anon → un client ne peut plus
-- voler le rôle d'hôte ni piloter la lecture par écriture directe.
--
-- ⚠️ À jouer APRÈS le déploiement du code (sinon les updates anon encore
-- présents côté client casseraient). La policy SELECT reste (loadRoom + Realtime).
-- Le cron cleanup_stale_rooms() supprime toujours (il tourne en owner, hors RLS).
drop policy if exists "rooms: anon update" on public.rooms;
drop policy if exists "rooms: anon delete" on public.rooms;
