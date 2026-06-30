-- Migration 23 : conformité API YouTube (politique III.E.4).
--
-- Les données issues de l'API YouTube ne doivent pas être conservées au-delà de
-- 30 jours sans être rafraîchies. `popular_tracks` agrège des métadonnées YouTube
-- (titre / artiste / pochette / durée) et était conservée indéfiniment.
-- On purge donc les entrées non réajoutées depuis 30 jours (`last_added_at`) ;
-- une entrée encore populaire est « rafraîchie » par le trigger à chaque ajout,
-- donc elle survit tant qu'elle reste utilisée.
--
-- ⚠️ À PLANIFIER en cron quotidien (pg_cron), comme cleanup_stale_rooms (cf. §11).

create or replace function public.cleanup_old_popular()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.popular_tracks where last_added_at < now() - interval '30 days';
$$;
