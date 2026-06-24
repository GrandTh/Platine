-- Durée sur les morceaux populaires (recommandations + autoplay).
--
-- `popular_tracks` ne stockait pas la durée → les recommandations et les
-- morceaux ajoutés par l'autoplay n'avaient pas de durée. On l'ajoute, et le
-- trigger `bump_popular_track` la recopie depuis le morceau inséré (en gardant
-- la valeur connue si un ajout ultérieur n'a pas de durée).
--
-- Se remplit PROGRESSIVEMENT : uniquement pour les morceaux (ré)ajoutés après
-- cette migration. Additif → à jouer avant ou avec le code (rétro-compatible).
alter table public.popular_tracks add column if not exists duration integer;

create or replace function public.bump_popular_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.popular_tracks (source, external_id, title, artist, cover, duration, add_count, last_added_at)
  values (new.source, new.external_id, new.title, coalesce(new.artist, ''), coalesce(new.cover, ''), new.duration, 1, now())
  on conflict (source, external_id) do update
    set add_count     = public.popular_tracks.add_count + 1,
        last_added_at = now(),
        title    = excluded.title,
        artist   = excluded.artist,
        cover    = excluded.cover,
        duration = coalesce(excluded.duration, public.popular_tracks.duration);
  return new;
end;
$$;
