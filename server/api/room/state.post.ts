/**
 * Écriture de l'état de lecture d'une room — RÉSERVÉ À L'HÔTE ACTIF.
 *
 * Remplace les updates anon directs sur `rooms` (play/pause, morceau courant,
 * graine de shuffle) : ils sont désormais bloqués par la RLS (cf. migration 18)
 * et vérifiés côté serveur (host_id === uid) pour empêcher tout pilotage de la
 * lecture par un non-hôte.
 *
 * Champs acceptés (tous optionnels, appliqués seulement s'ils sont fournis) :
 *   - playing : boolean
 *   - currentTrackId : string | null
 *   - shuffleSeed : string
 *   - autoplay : boolean
 *   - mode : 'speaker' | 'each'  (bascule « un seul ordi » ↔ « plusieurs ordi »)
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const WINDOWS: RateWindow[] = [{ tag: '1m', ttl: 60, limit: 120 }]

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  if (!roomId || !uid) {
    throw createError({ statusCode: 400, statusMessage: 'roomId et uid requis' })
  }

  const supabase = serverSupabaseServiceRole<Database>(event)
  // Rate limit en premier : un abuseur est rejeté sans déclencher les vérifs.
  await rateLimitByIp(event, supabase, 'room-state', WINDOWS)

  // « Membre actif » et « hôte actif » en parallèle (1 aller-retour économisé).
  // Les deux doivent passer : requireActiveMember lève 403 si KO ; sinon on
  // vérifie host_id ci-dessous. La sécurité est identique au séquentiel.
  const [, { data: room }] = await Promise.all([
    requireActiveMember(supabase, uid, roomId),
    supabase.from('rooms').select('host_id').eq('id', roomId).maybeSingle()
  ])
  if (!room || room.host_id !== uid) {
    throw createError({ statusCode: 403, statusMessage: 'Action réservée à l\'hôte' })
  }

  // Patch construit uniquement à partir des champs réellement fournis.
  const patch: Database['public']['Tables']['rooms']['Update'] = {}
  if (typeof body.playing === 'boolean') patch.playing = body.playing
  if ('currentTrackId' in body) {
    const t = body.currentTrackId
    patch.current_track_id = typeof t === 'string' && t ? t : null
  }
  if (typeof body.shuffleSeed === 'string' && body.shuffleSeed) {
    patch.shuffle_seed = body.shuffleSeed
  }
  if (typeof body.autoplay === 'boolean') patch.autoplay = body.autoplay
  if (body.mode === 'speaker' || body.mode === 'each') patch.mode = body.mode

  if (Object.keys(patch).length) {
    await supabase.from('rooms').update(patch).eq('id', roomId)
  }
  return { ok: true }
})
