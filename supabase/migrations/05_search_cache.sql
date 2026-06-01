-- ============================================================
--  MIGRATION 05 — Cache des recherches YouTube
--  search.list coûte 100 unités de quota. On mémorise les résultats
--  par requête normalisée : une recherche déjà faite (par n'importe qui)
--  est resservie depuis le cache → 0 unité.
--  À exécuter dans le SQL Editor de Supabase.
-- ============================================================

create table if not exists public.search_cache (
  q          text primary key,          -- requête normalisée (trim + lowercase)
  results    jsonb not null,            -- tableau de résultats sérialisés
  created_at timestamptz not null default now()
);

-- Realtime inutile ici. RLS : lecture/écriture anon (prototype).
alter table public.search_cache enable row level security;
create policy "search_cache: anon read"  on public.search_cache for select using (true);
create policy "search_cache: anon write" on public.search_cache for insert with check (true);

-- Purge optionnelle des entrées anciennes (> 30 jours), à brancher au cron
-- si besoin :
--   delete from public.search_cache where created_at < now() - interval '30 days';
