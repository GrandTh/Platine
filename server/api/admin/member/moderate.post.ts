/**
 * Admin : retire / rend le droit d'ajouter à un membre de n'importe quelle room.
 * L'HÔTE ne peut pas être muté. Réservé aux admins. Service role.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireAdmin(event)
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  const muted = body?.muted === true
  if (!roomId || !uid) throw createError({ statusCode: 400, statusMessage: 'roomId et uid requis' })

  const supabase = serverSupabaseServiceRole<Database>(event)
  const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).maybeSingle()
  if (room?.host_id === uid) {
    throw createError({ statusCode: 400, statusMessage: 'L\'hôte ne peut pas être muté' })
  }

  await supabase.from('members').update({ muted }).eq('room_id', roomId).eq('uid', uid)
  return { ok: true }
})
