-- ============================================================
--  MIGRATION 14 — Verrou anti-spam sur la CRÉATION de rooms
--
--  Problème : la clé anon est publique (bundle JS). Avec la policy
--  "rooms: anon full access", un bot peut insérer des rooms à l'infini
--  DIRECTEMENT sur l'API Supabase, sans passer par l'app.
--
--  Fix : on retire le droit d'INSERT anon. Désormais seule la route serveur
--  /api/room/ensure (clé service role, rate-limitée par IP) peut créer une
--  room. On garde select/update/delete anon (heartbeat, lecture, cleanup).
--
--  ⚠️ Déploiement coordonné : cette migration + le code (endpoint + client)
--  + la clé NUXT_SUPABASE_SECRET_KEY doivent arriver ensemble, sinon la
--  création de room casse.
--
--  À exécuter dans le SQL Editor de Supabase (prod) — déjà appliqué en local.
-- ============================================================

drop policy if exists "rooms: anon full access" on public.rooms;

-- Lecture (loadRoom + Realtime), mise à jour (heartbeat, play/pause, morceau
-- courant, shuffle) et suppression (cleanup) restent ouvertes en anon.
create policy "rooms: anon read"   on public.rooms for select using (true);
create policy "rooms: anon update" on public.rooms for update using (true) with check (true);
create policy "rooms: anon delete" on public.rooms for delete using (true);
-- PAS de policy INSERT → création impossible en anon ; seul le service role
-- (route /api/room/ensure) insère.
