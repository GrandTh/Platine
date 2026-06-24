/**
 * Ajout d'un morceau (insert anon désormais bloqué par la RLS, cf. migration 15).
 * Rejoue la logique de useQueue.addTrack côté serveur :
 *  - doublon (même source + external_id) → vote pour l'existant ('voted')
 *  - room pleine (>= 200) → 'full'
 *  - sinon → insert track (+ vote si withVote) → 'added'
 * Rate limit IP + membre actif requis.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const ROOM_CAP = 200
const WINDOWS: RateWindow[] = [
  { tag: '1m', ttl: 60, limit: 30 },
  { tag: '1h', ttl: 3600, limit: 200 }
]

export default defineEventHandler(async (event): Promise<{ status: 'added' | 'voted' | 'full' }> => {
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  const t = body?.track as { title?: string, artist?: string, cover?: string, source?: string, externalId?: string, duration?: number } | undefined
  const withVote = body?.withVote !== false
  const source = t?.source === 'spotify' ? 'spotify' : 'youtube'
  const externalId = t?.externalId?.trim()

  if (!roomId || !uid || !externalId || !t?.title) {
    throw createError({ statusCode: 400, statusMessage: 'Champs requis manquants' })
  }

  const supabase = serverSupabaseServiceRole<Database>(event)
  await rateLimitByIp(event, supabase, 'track-add', WINDOWS)
  await requireActiveMember(supabase, uid, roomId)

  // Doublon → vote pour l'existant.
  const { data: existing } = await supabase
    .from('tracks')
    .select('id')
    .eq('room_id', roomId)
    .eq('source', source)
    .eq('external_id', externalId)
    .maybeSingle()
  if (existing) {
    if (withVote) {
      // upsert-like : ignore si le vote existe déjà (PK track_id+voter_id).
      await supabase.from('votes').insert({ track_id: existing.id, voter_id: uid })
    }
    return { status: 'voted' }
  }

  // Plafond de la room.
  const { count } = await supabase
    .from('tracks')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
  if ((count ?? 0) >= ROOM_CAP) return { status: 'full' }

  const { data: inserted, error } = await supabase
    .from('tracks')
    .insert({
      room_id: roomId,
      title: t.title,
      artist: t.artist ?? '',
      cover: t.cover ?? '',
      source,
      external_id: externalId,
      added_by: uid,
      duration: typeof t.duration === 'number' ? Math.round(t.duration) : null
    })
    .select('id')
    .single()
  if (error || !inserted) {
    throw createError({ statusCode: 500, statusMessage: 'Ajout impossible' })
  }
  if (withVote) {
    await supabase.from('votes').insert({ track_id: inserted.id, voter_id: uid })
  }
  return { status: 'added' }
})
