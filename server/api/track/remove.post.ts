/**
 * Suppression d'un morceau (delete anon désormais bloqué par la RLS).
 * Autorisé seulement à l'AUTEUR du morceau ou à l'HÔTE de la room.
 * Rate limit IP + membre actif requis.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const WINDOWS: RateWindow[] = [{ tag: '1m', ttl: 60, limit: 40 }]

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  const trackId = (body?.trackId as string | undefined)?.trim()

  if (!roomId || !uid || !trackId) {
    throw createError({ statusCode: 400, statusMessage: 'roomId, uid et trackId requis' })
  }

  const supabase = serverSupabaseServiceRole<Database>(event)
  await rateLimitByIp(event, supabase, 'track-remove', WINDOWS)
  await requireActiveMember(supabase, uid, roomId)

  // Autorisation : auteur du morceau OU hôte de la room.
  const { data: track } = await supabase
    .from('tracks')
    .select(HISTORY_SELECT)
    .eq('id', trackId)
    .eq('room_id', roomId)
    .maybeSingle()
  if (!track) return { ok: true } // déjà supprimé → idempotent
  const { data: room } = await supabase
    .from('rooms')
    .select('host_id')
    .eq('id', roomId)
    .maybeSingle()
  const allowed = track.added_by === uid || room?.host_id === uid
  if (!allowed) {
    throw createError({ statusCode: 403, statusMessage: 'Action non autorisée' })
  }

  await recordHistory(supabase, [track]) // historique avant suppression
  await supabase.from('tracks').delete().eq('id', trackId)
  return { ok: true }
})
