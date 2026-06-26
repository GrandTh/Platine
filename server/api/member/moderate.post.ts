/**
 * Modération d'un membre — RÉSERVÉ À L'HÔTE ACTIF.
 *
 * Action unique pour l'instant : `mute` = retirer / rendre le droit d'AJOUTER
 * des morceaux (colonne members.muted, cf. migration 21). Le membre muté reste
 * dans la room (présence, vote, réactions) ; seuls track/add & track/import le
 * rejettent (requireCanAdd). Vérif hôte côté serveur (host_id === uid), comme
 * /api/room/state — jamais déduit du client.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const WINDOWS: RateWindow[] = [{ tag: '1m', ttl: 60, limit: 60 }]

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  const targetUid = (body?.targetUid as string | undefined)?.trim()
  const muted = body?.muted === true
  if (!roomId || !uid || !targetUid) {
    throw createError({ statusCode: 400, statusMessage: 'roomId, uid et targetUid requis' })
  }

  const supabase = serverSupabaseServiceRole<Database>(event)
  await rateLimitByIp(event, supabase, 'member-moderate', WINDOWS)

  // Membre actif + hôte actif (1 aller-retour économisé), comme /api/room/state.
  const [, { data: room }] = await Promise.all([
    requireActiveMember(supabase, uid, roomId),
    supabase.from('rooms').select('host_id').eq('id', roomId).maybeSingle()
  ])
  if (!room || room.host_id !== uid) {
    throw createError({ statusCode: 403, statusMessage: 'Action réservée à l\'hôte' })
  }
  // L'hôte ne peut pas se museler lui-même (garde-fou).
  if (targetUid === uid) {
    throw createError({ statusCode: 400, statusMessage: 'Cible invalide' })
  }

  await supabase.from('members')
    .update({ muted })
    .eq('room_id', roomId).eq('uid', targetUid)
  return { ok: true }
})
