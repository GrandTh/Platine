/**
 * Admin : supprime entièrement une room (membres/morceaux/votes partent en
 * cascade). Réservé aux admins. Service role.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireAdmin(event)
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  if (!roomId) throw createError({ statusCode: 400, statusMessage: 'roomId requis' })

  const supabase = serverSupabaseServiceRole<Database>(event)
  await supabase.from('rooms').delete().eq('id', roomId)
  return { ok: true }
})
