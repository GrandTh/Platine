/**
 * Admin : passe le morceau en cours d'une room (skip). Réservé aux admins.
 * Reproduit la logique de `advance()` côté client : on retire le morceau courant
 * et on désigne le suivant selon le MÊME tri (votes desc → 0-vote mélangé par la
 * graine → FIFO). Service role.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

// Rang pseudo-aléatoire déterministe (FNV-1a) — identique à useQueue/seededRank.
function seededRank(id: string, seed: string): number {
  let h = 2166136261
  const s = id + seed
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export default defineEventHandler(async (event): Promise<{ ok: true, next: string | null }> => {
  await requireAdmin(event)
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  if (!roomId) throw createError({ statusCode: 400, statusMessage: 'roomId requis' })

  const supabase = serverSupabaseServiceRole<Database>(event)
  const { data: room } = await supabase
    .from('rooms').select('current_track_id, shuffle_seed').eq('id', roomId).maybeSingle()
  if (!room) throw createError({ statusCode: 404, statusMessage: 'Room introuvable' })

  const { data: tracks } = await supabase
    .from('tracks').select('id, created_at').eq('room_id', roomId)
  const list = tracks ?? []

  // Votes par morceau.
  const ids = list.map(t => t.id)
  const votes = new Map<string, number>()
  if (ids.length) {
    const { data: v } = await supabase.from('votes').select('track_id').in('track_id', ids)
    for (const row of v ?? []) votes.set(row.track_id, (votes.get(row.track_id) ?? 0) + 1)
  }

  const seed = room.shuffle_seed
  const sorted = [...list].sort((a, b) => {
    const va = votes.get(a.id) ?? 0
    const vb = votes.get(b.id) ?? 0
    if (vb !== va) return vb - va
    if (seed && va === 0) return seededRank(a.id, seed) - seededRank(b.id, seed)
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const current = room.current_track_id
  const next = sorted.find(t => t.id !== current)?.id ?? null

  await supabase.from('rooms').update({ current_track_id: next }).eq('id', roomId)
  if (current) await supabase.from('tracks').delete().eq('id', current)

  return { ok: true, next }
})
