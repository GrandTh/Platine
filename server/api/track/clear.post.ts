/**
 * Vide la file à venir : supprime tous les morceaux de la room sauf celui en
 * cours (keepId). Réservé à l'HÔTE. Rate limit IP + membre actif requis.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const WINDOWS: RateWindow[] = [{ tag: '1m', ttl: 60, limit: 10 }]

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  const keepId = (body?.keepId as string | undefined)?.trim() || null

  if (!roomId || !uid) {
    throw createError({ statusCode: 400, statusMessage: 'roomId et uid requis' })
  }

  const supabase = serverSupabaseServiceRole<Database>(event)
  await rateLimitByIp(event, supabase, 'track-clear', WINDOWS)
  await requireActiveMember(supabase, uid, roomId)

  // Hôte uniquement.
  const { data: room } = await supabase
    .from('rooms')
    .select('host_id')
    .eq('id', roomId)
    .maybeSingle()
  if (room?.host_id !== uid) {
    throw createError({ statusCode: 403, statusMessage: 'Action réservée à l\'hôte' })
  }

  // Historique : on copie les morceaux vidés AVANT de les supprimer.
  let toRemove = supabase.from('tracks').select(HISTORY_SELECT).eq('room_id', roomId)
  if (keepId) toRemove = toRemove.neq('id', keepId)
  const { data: removed } = await toRemove
  await recordHistory(supabase, removed ?? [])

  let query = supabase.from('tracks').delete().eq('room_id', roomId)
  if (keepId) query = query.neq('id', keepId)
  await query
  return { ok: true }
})
