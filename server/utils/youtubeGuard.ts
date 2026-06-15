/**
 * Garde-fou anti-abus commun aux endpoints qui consomment le quota YouTube
 * (search / video / playlist).
 *
 *  1) Rate limit par IP (fenêtre courte anti-rafale + fenêtre large anti-spam),
 *     via la fonction Postgres atomique rl_hit (fiable sur le serverless Vercel).
 *  2) Requête réservée aux membres ACTIFS d'une room (uid + room présents en
 *     base, last_seen récent) → taper l'URL "à sec" est refusé.
 *
 * Fail-open : si la DB/la fonction ne répond pas (ex. migration 13 pas encore
 * jouée), on laisse passer plutôt que de casser la fonctionnalité.
 */
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

// Un membre est "actif" si vu il y a moins de 90 s (heartbeat client = 20 s).
const MEMBER_WINDOW_MS = 90_000

// Seuils de rate limit, par action et par IP.
const WINDOWS = [
  { tag: '10s', ttl: 10, limit: 8 },
  { tag: '5m', ttl: 300, limit: 40 }
] as const

export async function guardYoutubeRequest(
  event: H3Event,
  supabase: SupabaseClient<Database>,
  action: 'search' | 'video' | 'playlist',
  uid?: string,
  roomId?: string
): Promise<void> {
  // 1) Rate limit par IP (bucket distinct par action).
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  for (const w of WINDOWS) {
    const { data: allowed } = await supabase.rpc('rl_hit', {
      p_bucket: `${action}:${w.tag}:${ip}`,
      p_ttl_seconds: w.ttl,
      p_limit: w.limit
    })
    if (allowed === false) {
      throw createError({ statusCode: 429, statusMessage: 'Trop de requêtes, réessaie dans un instant' })
    }
  }

  // 2) Membre actif d'une room.
  if (!uid || !roomId) {
    throw createError({ statusCode: 403, statusMessage: 'Rejoins une room' })
  }
  const { data: member, error } = await supabase
    .from('members')
    .select('uid')
    .eq('room_id', roomId)
    .eq('uid', uid)
    .gt('last_seen', new Date(Date.now() - MEMBER_WINDOW_MS).toISOString())
    .maybeSingle()
  // error = souci DB → fail-open (le rate limit protège déjà) ; sinon, pas de
  // ligne = pas un membre actif → refus.
  if (!error && !member) {
    throw createError({ statusCode: 403, statusMessage: 'Rejoins une room' })
  }
}
