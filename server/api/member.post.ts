/**
 * Écriture des membres (insert/update anon désormais bloqués par la RLS).
 * Actions : join (upsert présence), heartbeat (last_seen), rename (pseudo).
 * Création via endpoint rate-limité = pièce maîtresse anti faux-membres
 * (qui borne aussi le bourrage de votes/skips, uniques par utilisateur).
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const LIMITS: Record<string, RateWindow[]> = {
  join: [{ tag: '1m', ttl: 60, limit: 30 }, { tag: '1h', ttl: 3600, limit: 200 }],
  heartbeat: [{ tag: '1m', ttl: 60, limit: 60 }],
  rename: [{ tag: '1m', ttl: 60, limit: 15 }]
}

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody(event)
  const action = body?.action as string | undefined
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  if (!roomId || !uid) {
    throw createError({ statusCode: 400, statusMessage: 'roomId et uid requis' })
  }

  const supabase = serverSupabaseServiceRole<Database>(event)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 24) : undefined

  if (action === 'join') {
    await rateLimitByIp(event, supabase, 'member-join', LIMITS.join)
    await supabase.from('members').upsert({
      room_id: roomId,
      uid,
      last_seen: new Date().toISOString(),
      ...(name ? { name } : {})
    })
    return { ok: true }
  }
  if (action === 'heartbeat') {
    await rateLimitByIp(event, supabase, 'member-hb', LIMITS.heartbeat)
    await supabase.from('members')
      .update({ last_seen: new Date().toISOString() })
      .eq('room_id', roomId).eq('uid', uid)
    return { ok: true }
  }
  if (action === 'rename') {
    await rateLimitByIp(event, supabase, 'member-rename', LIMITS.rename)
    await supabase.from('members')
      .update({ name: name || null })
      .eq('room_id', roomId).eq('uid', uid)
    return { ok: true }
  }
  throw createError({ statusCode: 400, statusMessage: 'action invalide' })
})
