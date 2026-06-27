/**
 * Toggle d'un vote sur un morceau (insert/delete anon bloqués par la RLS).
 * Rate limit IP + membre actif requis. 1 vote max par (morceau, utilisateur).
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const WINDOWS: RateWindow[] = [{ tag: '1m', ttl: 60, limit: 60 }]

export default defineEventHandler(async (event): Promise<{ voted: boolean }> => {
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  const trackId = (body?.trackId as string | undefined)?.trim()
  if (!roomId || !uid || !trackId) {
    throw createError({ statusCode: 400, statusMessage: 'roomId, uid et trackId requis' })
  }

  const supabase = serverSupabaseServiceRole<Database>(event)
  await rateLimitByIp(event, supabase, 'vote', WINDOWS)
  await requireActiveMember(supabase, uid, roomId)

  // Le morceau doit appartenir à CETTE room (sinon vote inter-rooms possible).
  const { data: track } = await supabase
    .from('tracks')
    .select('id')
    .eq('id', trackId)
    .eq('room_id', roomId)
    .maybeSingle()
  if (!track) {
    throw createError({ statusCode: 404, statusMessage: 'Morceau introuvable dans cette room' })
  }

  const { data: existing } = await supabase
    .from('votes')
    .select('track_id')
    .eq('track_id', trackId)
    .eq('voter_id', uid)
    .maybeSingle()
  if (existing) {
    await supabase.from('votes').delete().eq('track_id', trackId).eq('voter_id', uid)
    return { voted: false }
  }
  await supabase.from('votes').insert({ track_id: trackId, voter_id: uid })
  return { voted: true }
})
