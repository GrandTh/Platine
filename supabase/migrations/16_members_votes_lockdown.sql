-- ============================================================
--  MIGRATION 16 — Verrou anti-abus : members / votes / skip_votes
--
--  Dernière surface d'écriture directe anon. Comme rooms/tracks, on passe ces
--  3 tables en LECTURE SEULE en anon (nécessaire pour le Realtime + lectures)
--  et toute écriture passe par les routes serveur (service role, rate-limitées,
--  membre actif requis pour les votes) :
--    members     → /api/member (join/heartbeat/rename) + /api/member/leave
--    votes       → /api/vote
--    skip_votes  → /api/skip-vote
--
--  Verrouiller `members` est la pièce maîtresse : votes & skip_votes étant
--  uniques par (utilisateur, morceau), borner la création de membres borne
--  mécaniquement le bourrage.
--
--  ⚠️ Déploiement coordonné : migration + code ensemble (code d'abord).
--  À exécuter dans le SQL Editor de Supabase (prod) — déjà appliqué en local.
-- ============================================================

drop policy if exists "members: anon full access" on public.members;
create policy "members: anon read" on public.members for select using (true);

drop policy if exists "votes: anon full access" on public.votes;
create policy "votes: anon read" on public.votes for select using (true);

drop policy if exists "skip_votes: anon full access" on public.skip_votes;
create policy "skip_votes: anon read" on public.skip_votes for select using (true);
