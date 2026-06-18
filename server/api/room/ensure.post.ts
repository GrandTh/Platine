/**
 * Création d'une room — SEUL point d'entrée autorisé (l'insert anon direct est
 * bloqué par la RLS, cf. migration 14).
 *
 *  - Idempotent : si la room existe déjà (revisite de l'hôte, refresh), on ne
 *    consomme rien (pas de rate limit).
 *  - Sinon : rate limit IP STRICT (anti-bot) puis insert via la clé service
 *    role (qui contourne la RLS).
 *
 * La clé service role n'est jamais exposée au client.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

// Seuils stricts par IP, sur les VRAIES créations (un hôte en crée ~1).
const LIMITS = [
  { tag: '1m', ttl: 60, limit: 3 },
  { tag: '1h', ttl: 3600, limit: 15 }
] as const

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const roomId = (body?.roomId as string | undefined)?.trim()
  const uid = (body?.uid as string | undefined)?.trim()
  const mode = body?.mode === 'each' ? 'each' : 'speaker'

  if (!roomId || !uid) {
    throw createError({ statusCode: 400, statusMessage: 'roomId et uid requis' })
  }

  const supabase = serverSupabaseServiceRole<Database>(event)

  // 1) Idempotence : room déjà là → rien à faire, pas de rate limit consommé.
  const { data: existing } = await supabase
    .from('rooms')
    .select('id')
    .eq('id', roomId)
    .maybeSingle()
  if (existing) return { ok: true, created: false }

  // 2) Rate limit IP (uniquement sur les nouvelles créations).
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  for (const w of LIMITS) {
    const { data: allowed } = await supabase.rpc('rl_hit', {
      p_bucket: `room:${w.tag}:${ip}`,
      p_ttl_seconds: w.ttl,
      p_limit: w.limit
    })
    if (allowed === false) {
      throw createError({ statusCode: 429, statusMessage: 'Trop de rooms créées, réessaie plus tard' })
    }
  }

  // 3) Création (service role → contourne la RLS). Conflit = course → OK.
  const { error } = await supabase.from('rooms').insert({
    id: roomId,
    host_id: uid,
    mode,
    playing: true,
    last_active: new Date().toISOString()
  })
  if (error && !/duplicate|conflict|already exists/i.test(error.message)) {
    throw createError({ statusCode: 500, statusMessage: 'Création de room impossible' })
  }
  return { ok: true, created: true }
})
