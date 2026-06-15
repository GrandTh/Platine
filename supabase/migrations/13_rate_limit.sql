-- ============================================================
--  MIGRATION 13 — Rate limit (anti-abus de la recherche YouTube)
--
--  Contexte : search.list coûte 100 unités, quota = 10 000/jour. Un script
--  qui tape /api/search en boucle (ex. 3 req/s) vide le quota en ~30 s.
--  Le debounce côté client ne protège rien (l'endpoint est appelable direct),
--  donc on limite CÔTÉ SERVEUR, par IP, via un compteur à fenêtre fixe.
--
--  Pourquoi en DB et pas en mémoire ? Vercel = serverless multi-instances :
--  un compteur en mémoire ne serait pas partagé entre instances. Une fonction
--  Postgres atomique (insert ... on conflict +1) est fiable et partagée.
--
--  À exécuter dans le SQL Editor de Supabase (prod) — déjà appliqué en local.
-- ============================================================

create table if not exists public.rate_limit (
  bucket     text primary key,          -- ex. "s10:1.2.3.4" (action:fenetre:ip)
  count      integer not null default 0,
  expires_at timestamptz not null
);

create index if not exists rate_limit_expires_idx on public.rate_limit (expires_at);

-- Incrémente le compteur du bucket et indique si on est SOUS la limite.
-- Renvoie true = autorisé, false = bloqué. Atomique (pas de course).
-- SECURITY DEFINER : écrit la table malgré la RLS ; les clients anon ne
-- peuvent pas y toucher directement, seul cet appel le fait.
create or replace function public.rl_hit(p_bucket text, p_ttl_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c integer;
begin
  -- Purge légère des buckets expirés (index sur expires_at → rapide).
  delete from public.rate_limit where expires_at < now();

  insert into public.rate_limit (bucket, count, expires_at)
  values (p_bucket, 1, now() + make_interval(secs => p_ttl_seconds))
  on conflict (bucket) do update set count = public.rate_limit.count + 1
  returning count into c;

  return c <= p_limit;
end;
$$;

-- RLS active SANS policy : aucun accès direct anon ; tout passe par rl_hit.
alter table public.rate_limit enable row level security;
