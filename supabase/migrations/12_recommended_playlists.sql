-- ============================================================
--  MIGRATION 12 — Playlists recommandées (chips de l'onglet recherche)
--
--  La LISTE des chips (libellé + ID de playlist) vit en DB → modifiable depuis
--  le Table Editor de Supabase, effet immédiat, SANS redéploiement.
--  Le front lit cette table à l'ouverture de l'onglet recherche.
--
--  Pour ajouter une playlist : insère une ligne. `playlist_id` = la valeur
--  après `list=` dans l'URL YouTube (ex. .../playlist?list=PLxxxx → PLxxxx).
--  `position` ordonne les chips (croissant). `enabled=false` masque sans
--  supprimer. Le fichier app/utils/recommendedPlaylists.ts reste un fallback
--  si la table est vide.
--
--  À exécuter dans le SQL Editor de Supabase (prod) — déjà appliqué en local.
-- ============================================================

create table if not exists public.recommended_playlists (
  playlist_id text primary key,            -- valeur après `list=`
  label       text not null,               -- libellé affiché sur la chip
  position    integer not null default 0,  -- ordre d'affichage (croissant)
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- RLS : lecture publique (la liste n'a rien de secret). Écriture = via le
-- Table Editor / SQL (rôle service), pas depuis le client anon.
alter table public.recommended_playlists enable row level security;
create policy "recommended_playlists: anon read"
  on public.recommended_playlists for select using (true);

-- Seed initial (idempotent) : tes playlists actuelles.
insert into public.recommended_playlists (playlist_id, label, position) values
  ('PL4fGSI1pDJn7bK3y1Hx-qpHBqfr6cesNs',        'Top 100 France', 1),
  ('RDCLAK5uy_nWufZ3-rH924TsgmroKWiilEk-BQweReI', 'Années 80',    2),
  ('RDCLAK5uy_nmS3YoxSwVVQk9lEQJ0UX4ZCjXsW_psU8', 'Pop',          3),
  ('RDCLAK5uy_n64_P7t3MmbTu7jziSk48DL',           'Techno',       4),
  ('RDCLAK5uy_lBGRuQnsG37Akr1CY4SxL0VWFbPrbO4gs', 'Rap',          5)
on conflict (playlist_id) do nothing;
