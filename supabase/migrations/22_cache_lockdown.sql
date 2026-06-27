-- Migration 22 : verrouillage des caches (anti cache-poisoning).
--
-- search_cache (insert anon) et playlist_cache (all anon) étaient écrivables par
-- n'importe quel client anon → injection de faux résultats servis aux victimes,
-- et suppression possible (playlist_cache) → re-fetch = quota YouTube brûlé.
-- Désormais seules les routes serveur (service role) écrivent ces caches.
-- La lecture anon est conservée (données non sensibles, aucun impact).
--
-- ⚠️ Ordre de déploiement : CODE AVANT LA MIGRATION (search.get/playlist.get
-- doivent déjà écrire le cache en service role, sinon le caching casse — non
-- bloquant pour l'UX, mais ça gaspillerait du quota).

-- search_cache : retire l'écriture anon (poisoning).
drop policy if exists "search_cache: anon write" on public.search_cache;

-- playlist_cache : retire l'accès total anon, repasse en lecture seule.
drop policy if exists "playlist_cache: anon all" on public.playlist_cache;
create policy "playlist_cache: anon read"
  on public.playlist_cache for select using (true);
