/**
 * Admin : force la lecture/pause d'une room. Réservé aux admins. Service role.
 * Propagé à tous via le Realtime `rooms` (comme l'action de l'hôte).
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireAdmin(event)
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const playing = body?.playing === true
  if (!roomId) throw createError({ statusCode: 400, statusMessage: 'roomId requis' })

  const supabase = serverSupabaseServiceRole<Database>(event)
  await supabase.from('rooms').update({ playing }).eq('id', roomId)
  return { ok: true }
})
