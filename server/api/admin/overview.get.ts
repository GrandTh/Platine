/**
 * Vue d'ensemble admin : rooms ACTIVES + stats globales + top morceaux.
 * (Rooms éphémères supprimées par le cron après 5 min → « toutes » = actives.)
 * Réservé aux admins (requireAdmin : session + 2FA aal2 + allowlist).
 * Lecture seule, service role.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'
import type { AdminOverview, AdminRoom } from '~/types/admin'

// Membre « en ligne » = vu il y a moins de 60 s (même fenêtre que l'app).
const ONLINE_MS = 60_000

export default defineEventHandler(async (event): Promise<AdminOverview> => {
  await requireAdmin(event)
  const supabase = serverSupabaseServiceRole<Database>(event)

  const [{ data: rooms }, { data: members }, { data: tracks }, { count: votes }, { data: popular }] = await Promise.all([
    supabase.from('rooms').select('id, host_id, owner_id, mode, playing, autoplay, current_track_id, last_active, created_at'),
    supabase.from('members').select('room_id, last_seen'),
    supabase.from('tracks').select('room_id'),
    supabase.from('votes').select('track_id', { count: 'exact', head: true }),
    supabase.from('popular_tracks').select('title, artist, cover, add_count').order('add_count', { ascending: false }).limit(10)
  ])

  // Titre du morceau en cours par room (résolu en une requête).
  const currentIds = (rooms ?? []).map(r => r.current_track_id).filter((x): x is string => !!x)
  const titleById = new Map<string, string>()
  if (currentIds.length) {
    const { data: cur } = await supabase.from('tracks').select('id, title').in('id', currentIds)
    for (const t of cur ?? []) titleById.set(t.id, t.title)
  }

  // Compteurs par room. Membres : présents uniquement (cohérent avec l'app).
  const cutoff = Date.now() - ONLINE_MS
  const present = (members ?? []).filter(m => new Date(m.last_seen).getTime() > cutoff)
  const countBy = (rows: { room_id: string }[]) => {
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.room_id, (map.get(r.room_id) ?? 0) + 1)
    return map
  }
  const mc = countBy(present)
  const tc = countBy(tracks ?? [])

  const list: AdminRoom[] = (rooms ?? [])
    .map(r => ({
      id: r.id,
      hostId: r.host_id,
      ownerId: r.owner_id,
      mode: r.mode,
      playing: r.playing,
      autoplay: r.autoplay,
      memberCount: mc.get(r.id) ?? 0,
      trackCount: tc.get(r.id) ?? 0,
      nowPlaying: r.current_track_id ? (titleById.get(r.current_track_id) ?? null) : null,
      lastActive: r.last_active,
      createdAt: r.created_at
    }))
    .sort((a, b) => b.lastActive.localeCompare(a.lastActive))

  return {
    rooms: list,
    stats: {
      activeRooms: list.length,
      membersOnline: present.length,
      tracksQueued: (tracks ?? []).length,
      votes: votes ?? 0
    },
    topTracks: (popular ?? []).map(p => ({
      title: p.title,
      artist: p.artist,
      cover: p.cover,
      addCount: p.add_count
    }))
  }
})
