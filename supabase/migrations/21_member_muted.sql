-- Migration 21 : modération « droit d'ajouter ».
-- L'hôte peut retirer à un membre le droit d'ajouter des morceaux (mute).
-- Le membre reste dans la room (vote, réactions) mais ses ajouts sont refusés
-- côté serveur (track/add + track/import). Realtime déjà actif sur members.
--
-- Ordre de déploiement : MIGRATION AVANT LE CODE (colonne lue par requireCanAdd).

alter table public.members
  add column if not exists muted boolean not null default false;
