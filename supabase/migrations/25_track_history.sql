-- Historique de la playlist : chaque morceau qui QUITTE la file (joué, retiré,
-- ou vidé via « clear ») y est copié, pour pouvoir le re-ajouter en un clic.
-- Alimenté UNIQUEMENT par les endpoints de suppression (service role), jamais par
-- l'expiration de la room (cascade → l'historique part avec la room).

create table if not exists public.track_history (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null references public.rooms(id) on delete cascade,
  title       text not null,
  artist      text not null default '',
  cover       text not null default '',
  source      text not null default 'youtube',
  external_id text not null,
  duration    integer,
  added_by    text,
  played_at   timestamptz not null default now()
);

create index if not exists track_history_room_idx
  on public.track_history (room_id, played_at desc);

-- Realtime : l'onglet Historique se met à jour en direct quand un son passe.
alter publication supabase_realtime add table public.track_history;

-- RLS : lecture anon (nécessaire au Realtime), aucune écriture anon (service role only).
alter table public.track_history enable row level security;
create policy "track_history: anon read"
  on public.track_history for select using (true);
