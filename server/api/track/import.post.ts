/**
 * Import groupé (playlist) : insère plusieurs morceaux SANS vote, en ignorant
 * les doublons, dans la limite du plafond de la room (200). Ordre préservé via
 * created_at incrémental. Rate limit IP + membre actif requis.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const ROOM_CAP = 200
const WINDOWS: RateWindow[] = [
  { tag: '1m', ttl: 60, limit: 5 },
  { tag: '1h', ttl: 3600, limit: 30 }
]

interface InTrack { title?: string, artist?: string, cover?: string, source?: string, externalId?: string, duration?: number }

export default defineEventHandler(async (event): Promise<{ added: number }> => {
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  const list = Array.isArray(body?.tracks) ? (body.tracks as InTrack[]) : []

  if (!roomId || !uid) {
    throw createError({ statusCode: 400, statusMessage: 'roomId et uid requis' })
  }
  if (!list.length) return { added: 0 }

  const supabase = serverSupabaseServiceRole<Database>(event)
  await rateLimitByIp(event, supabase, 'track-import', WINDOWS)
  await requireActiveMember(supabase, uid, roomId)

  // Doublons déjà en file + place restante.
  const { data: current } = await supabase
    .from('tracks')
    .select('source, external_id')
    .eq('room_id', roomId)
  const existingKeys = new Set((current ?? []).map(r => `${r.source}:${r.external_id}`))
  const remaining = Math.max(0, ROOM_CAP - (current?.length ?? 0))
  if (remaining === 0) return { added: 0 }

  const base = Date.now()
  // Dédup contre l'existant ET à l'intérieur du lot (seen accumule au fil).
  const seen = new Set(existingKeys)
  const toInsert = list
    .filter(t => t.externalId && t.title)
    .map(t => ({ ...t, source: t.source === 'spotify' ? 'spotify' : 'youtube' as const }))
    .filter((t) => {
      const k = `${t.source}:${t.externalId}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, remaining)
    .map((t, i) => ({
      room_id: roomId,
      title: t.title as string,
      artist: t.artist ?? '',
      cover: t.cover ?? '',
      source: t.source,
      external_id: t.externalId as string,
      added_by: uid,
      duration: typeof t.duration === 'number' ? Math.round(t.duration) : null,
      created_at: new Date(base + i).toISOString()
    }))

  if (!toInsert.length) return { added: 0 }
  const { error } = await supabase.from('tracks').insert(toInsert)
  if (error) throw createError({ statusCode: 500, statusMessage: 'Import impossible' })
  return { added: toInsert.length }
})
