-- ============================================================
--  MIGRATION 10 — Morceaux populaires (recommandations)
--
--  Compteur PERSISTANT du nombre de fois qu'un morceau est ajouté, toutes
--  rooms confondues. Sert à proposer des recommandations dans l'onglet
--  recherche tant que l'utilisateur n'a rien cherché.
--
--  Pourquoi une table dédiée plutôt qu'un GROUP BY sur `tracks` ? Parce que
--  les rooms sont éphémères : quand une room est nettoyée, ses `tracks` partent
--  en cascade. Ce compteur, lui, survit → l'historique de popularité s'accumule.
--
--  Anti-triche gratuit : `tracks` interdit déjà les doublons dans une même room
--  (un re-ajout = un vote, pas un insert). Le trigger ne s'incrémente que sur un
--  vrai INSERT → un morceau ne compte qu'une fois par room (≈ rooms distinctes).
--
--  À exécuter dans le SQL Editor de Supabase (prod) — déjà appliqué en local.
-- ============================================================

create table if not exists public.popular_tracks (
  source        text not null,
  external_id   text not null,
  title         text not null default '',
  artist        text not null default '',
  cover         text not null default '',
  add_count     integer not null default 0,
  last_added_at timestamptz not null default now(),
  primary key (source, external_id)
);

create index if not exists popular_tracks_count_idx
  on public.popular_tracks (add_count desc);

-- Incrémente le compteur à CHAQUE insert dans `tracks` (ajout unitaire ET
-- import de playlist). SECURITY DEFINER → contourne la RLS (les clients anon
-- ne peuvent pas écrire popular_tracks directement, seul le trigger le fait).
create or replace function public.bump_popular_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.popular_tracks (source, external_id, title, artist, cover, add_count, last_added_at)
  values (new.source, new.external_id, new.title, coalesce(new.artist, ''), coalesce(new.cover, ''), 1, now())
  on conflict (source, external_id) do update
    set add_count     = public.popular_tracks.add_count + 1,
        last_added_at = now(),
        -- Rafraîchit les métadonnées (titre/pochette peuvent varier légèrement).
        title  = excluded.title,
        artist = excluded.artist,
        cover  = excluded.cover;
  return new;
end;
$$;

drop trigger if exists trg_bump_popular on public.tracks;
create trigger trg_bump_popular
  after insert on public.tracks
  for each row execute function public.bump_popular_track();

-- RLS : lecture seule pour anon (l'écriture passe uniquement par le trigger).
alter table public.popular_tracks enable row level security;
create policy "popular_tracks: anon read"
  on public.popular_tracks for select using (true);

-- Nettoyage optionnel des "one-hit-wonders" jamais repris (à brancher au cron
-- si la table grossit un jour ; inutile au début) :
--   delete from public.popular_tracks
--   where add_count = 1 and last_added_at < now() - interval '30 days';
