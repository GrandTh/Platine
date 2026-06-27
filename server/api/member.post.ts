/**
 * Ecriture des membres (insert/update anon desormais bloques par la RLS).
 * Actions : join (upsert presence), heartbeat (last_seen), rename (pseudo).
 * Creation via endpoint rate-limite = piece maitresse anti faux-membres
 * (qui borne aussi le bourrage de votes/skips, uniques par utilisateur).
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const LIMITS: Record<string, RateWindow[]> = {
  join: [{ tag: '1m', ttl: 60, limit: 30 }, { tag: '1h', ttl: 3600, limit: 200 }],
  heartbeat: [{ tag: '1m', ttl: 60, limit: 60 }],
  rename: [{ tag: '1m', ttl: 60, limit: 15 }]
}

// On ne rafraichit `rooms.last_active` (et ne reconcilie l'hote) qu'au plus une
// fois par room toutes les 60 s : le keep-alive n'a besoin d'etre frais qu'a
// 5 min pres (cleanup cron). Evite un event Realtime `rooms` a CHAQUE heartbeat
// de CHAQUE membre (amplification quadratique).
const LAST_ACTIVE_THROTTLE_MS = 60_000

// Caracteres invisibles bannis d'un pseudo (sinon pseudo visuellement vide) :
// controles C0/C1, soft hyphen, espaces de largeur nulle, jointeurs, marques
// directionnelles, separateurs ligne/para, word joiner, BOM. String.trim() ne
// les retire PAS -> un pseudo compose uniquement de ceux-ci s'affichait VIDE.
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g

/** Nettoie un pseudo : retire les invisibles ci-dessus, normalise les espaces,
 *  borne a 24 car. Vide apres nettoyage -> undefined (repli client sur l'id court). */
function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const cleaned = raw
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
    .trim()
  return cleaned || undefined
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
  const name = cleanName(body?.name)

  if (action === 'join') {
    await rateLimitByIp(event, supabase, 'member-join', LIMITS.join)
    await supabase.from('members').upsert({
      room_id: roomId,
      uid,
      last_seen: new Date().toISOString(),
      ...(name ? { name } : {})
    })
    await supabase.from('rooms').update({ last_active: new Date().toISOString() }).eq('id', roomId)
    await reconcileHost(supabase, roomId).catch(() => {})
    return { ok: true }
  }
  if (action === 'heartbeat') {
    await rateLimitByIp(event, supabase, 'member-hb', LIMITS.heartbeat)
    await supabase.from('members')
      .update({ last_seen: new Date().toISOString() })
      .eq('room_id', roomId).eq('uid', uid)
    // Bump `last_active` SEULEMENT s'il est perime (> 60 s) → 1 update/room/min
    // au lieu d'un par heartbeat. La reconciliation d'hote suit le meme rythme
    // (suffisant : grace d'hote = 3 min). `.select()` dit si une ligne a bouge.
    const cutoff = new Date(Date.now() - LAST_ACTIVE_THROTTLE_MS).toISOString()
    const { data: bumped } = await supabase.from('rooms')
      .update({ last_active: new Date().toISOString() })
      .eq('id', roomId).lt('last_active', cutoff)
      .select('id')
    if (bumped?.length) await reconcileHost(supabase, roomId).catch(() => {})
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
