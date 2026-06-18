-- ============================================================
--  MIGRATION 15 — Verrou anti-spam sur l'écriture des tracks
--
--  Comme pour les rooms : la clé anon est publique, donc "tracks: anon full
--  access" permet à un bot d'insérer/supprimer des morceaux DIRECTEMENT sur
--  Supabase (spam d'ajouts, suppression des morceaux des autres).
--
--  Fix : tracks passe en LECTURE SEULE en anon (nécessaire pour le Realtime).
--  Toute écriture passe par les routes serveur /api/track/* (clé service role,
--  rate-limitées + autorisation auteur/hôte).
--
--  ⚠️ Déploiement coordonné : migration + code (endpoints + client) ensemble.
--  Les votes restent ouverts (verrou prévu en phase suivante).
--
--  À exécuter dans le SQL Editor de Supabase (prod) — déjà appliqué en local.
-- ============================================================

drop policy if exists "tracks: anon full access" on public.tracks;

-- Lecture seule (loadRoom + Realtime). Insert/update/delete retirés.
create policy "tracks: anon read" on public.tracks for select using (true);
