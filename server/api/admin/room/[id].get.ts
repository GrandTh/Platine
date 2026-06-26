/**
 * Détail admin d'une room : membres (présence, muté) + file complète (titre,
 * artiste, durée, votes, ajouté par). Réservé aux admins (requireAdmin).
 * Lecture seule, service role.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'
import type { AdminRoomDetail } from '~/types/admin'

export default defineEventHandler(async (event): Promise<AdminRoomDetail> => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) throw createError({ statusCode: 400, statusMessage: 'roomId requis' })

  const supabase = serverSupabaseServiceRole<Database>(event)
  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id, owner_id, mode, playing, autoplay, current_track_id, last_active, created_at')
    .eq('id', id)
    .maybeSingle()
  if (!room) throw createError({ statusCode: 404, statusMessage: 'Room introuvable' })

  const [{ data: members }, { data: tracks }] = await Promise.all([
    supabase.from('members')
      .select('uid, name, muted, last_seen, created_at')
      .eq('room_id', id),
    supabase.from('tracks')
      .select('id, title, artist, cover, source, external_id, duration, added_by, created_at')
      .eq('room_id', id)
      .order('created_at', { ascending: true })
  ])

  // Votes par morceau (table votes globale → on filtre sur les track_id de la room).
  const trackIds = (tracks ?? []).map(t => t.id)
  const voteCount = new Map<string, number>()
  if (trackIds.length) {
    const { data: votes } = await supabase.from('votes').select('track_id').in('track_id', trackIds)
    for (const v of votes ?? []) voteCount.set(v.track_id, (voteCount.get(v.track_id) ?? 0) + 1)
  }

  return {
    id: room.id,
    hostId: room.host_id,
    ownerId: room.owner_id,
    mode: room.mode,
    playing: room.playing,
    autoplay: room.autoplay,
    currentTrackId: room.current_track_id,
    lastActive: room.last_active,
    createdAt: room.created_at,
    members: (members ?? []).map(m => ({
      uid: m.uid,
      name: m.name,
      muted: m.muted === true,
      lastSeen: m.last_seen,
      createdAt: m.created_at
    })),
    tracks: (tracks ?? []).map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      cover: t.cover,
      source: t.source,
      externalId: t.external_id,
      duration: t.duration,
      addedBy: t.added_by,
      votes: voteCount.get(t.id) ?? 0,
      createdAt: t.created_at
    }))
  }
})
