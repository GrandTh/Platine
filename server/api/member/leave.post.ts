/**
 * Départ d'un membre (delete anon désormais bloqué par la RLS). Appelé en
 * navigation interne ET à la fermeture d'onglet (fetch keepalive).
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  if (!roomId || !uid) {
    throw createError({ statusCode: 400, statusMessage: 'roomId et uid requis' })
  }
  const supabase = serverSupabaseServiceRole<Database>(event)
  await supabase.from('members').delete().eq('room_id', roomId).eq('uid', uid)
  // Départ d'un membre → réconcilie l'hôte (démarre la grâce si le proprio part,
  // ou enchaîne sur le suivant si un hôte de remplacement s'en va). Best-effort.
  await reconcileHost(supabase, roomId).catch(() => {})
  return { ok: true }
})
