/**
 * Vue d'ensemble admin : liste des rooms ACTIVES (les rooms éphémères sont
 * supprimées par le cron après 5 min d'inactivité, donc « toutes » = actives).
 * Réservé aux admins (requireAdmin : session + 2FA aal2 + allowlist).
 * Lecture seule, service role.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'
import type { AdminRoom } from '~/types/admin'

export default defineEventHandler(async (event): Promise<{ rooms: AdminRoom[] }> => {
  await requireAdmin(event)
  const supabase = serverSupabaseServiceRole<Database>(event)

  const [{ data: rooms }, { data: members }, { data: tracks }] = await Promise.all([
    supabase.from('rooms').select('id, host_id, owner_id, mode, playing, autoplay, last_active, created_at'),
    supabase.from('members').select('room_id'),
    supabase.from('tracks').select('room_id')
  ])

  // Agrégation des compteurs en mémoire (peu de rooms actives → pas de RPC group by).
  const count = (rows: { room_id: string }[] | null) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r.room_id, (m.get(r.room_id) ?? 0) + 1)
    return m
  }
  const mc = count(members)
  const tc = count(tracks)

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
      lastActive: r.last_active,
      createdAt: r.created_at
    }))
    .sort((a, b) => b.lastActive.localeCompare(a.lastActive))

  return { rooms: list }
})
