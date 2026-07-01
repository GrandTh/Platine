/**
 * Admin : pousse une annonce (« god mode ») dans une room → overlay plein écran
 * chez tous les participants (~4 s puis fondu). Réservé aux admins. Service role.
 *
 * Infalsifiable : l'écriture sur `announcements` est interdite en anon (RLS), donc
 * seul cet endpoint admin peut en émettre. Les clients réagissent à l'INSERT
 * Realtime.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const MAX_LEN = 200

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireAdmin(event)
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const message = (body?.message as string | undefined)?.trim().slice(0, MAX_LEN)
  if (!roomId || !message) throw createError({ statusCode: 400, statusMessage: 'roomId et message requis' })

  const supabase = serverSupabaseServiceRole<Database>(event)
  // La room doit exister (sinon la FK rejette de toute façon).
  const { error } = await supabase.from('announcements').insert({ room_id: roomId, message })
  if (error) throw createError({ statusCode: 400, statusMessage: 'Annonce impossible' })
  return { ok: true }
})
