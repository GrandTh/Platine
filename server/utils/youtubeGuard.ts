/**
 * Briques anti-abus partagées par les endpoints serveur :
 *  - rateLimitByIp : compteur par IP (fenêtres configurables) via rl_hit.
 *  - requireActiveMember : exige un uid membre ACTIF d'une room.
 *
 * Fail-open sur erreur DB (ex. migration pas encore jouée) → on ne casse pas
 * la fonctionnalité ; le reste des protections continue de s'appliquer.
 */
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

// Un membre est "actif" si vu il y a moins de 90 s (heartbeat client = 20 s).
const MEMBER_WINDOW_MS = 90_000

export interface RateWindow { tag: string, ttl: number, limit: number }

/** Rate limit par IP, sur une ou plusieurs fenêtres. Lève 429 si dépassé. */
export async function rateLimitByIp(
  event: H3Event,
  supabase: SupabaseClient<Database>,
  action: string,
  windows: RateWindow[]
): Promise<void> {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  for (const w of windows) {
    const { data: allowed } = await supabase.rpc('rl_hit', {
      p_bucket: `${action}:${w.tag}:${ip}`,
      p_ttl_seconds: w.ttl,
      p_limit: w.limit
    })
    if (allowed === false) {
      throw createError({ statusCode: 429, statusMessage: 'Trop de requêtes, réessaie dans un instant' })
    }
  }
}

/** Exige que l'uid soit un membre actif de la room. Lève 403 sinon. */
export async function requireActiveMember(
  supabase: SupabaseClient<Database>,
  uid?: string,
  roomId?: string
): Promise<void> {
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
  if (!error && !member) {
    throw createError({ statusCode: 403, statusMessage: 'Rejoins une room' })
  }
}

// Endpoints YouTube (search / video / playlist) : rate limit + membre actif.
const YT_WINDOWS: RateWindow[] = [
  { tag: '10s', ttl: 10, limit: 8 },
  { tag: '5m', ttl: 300, limit: 40 }
]

export async function guardYoutubeRequest(
  event: H3Event,
  supabase: SupabaseClient<Database>,
  action: 'search' | 'video' | 'playlist',
  uid?: string,
  roomId?: string
): Promise<void> {
  await rateLimitByIp(event, supabase, action, YT_WINDOWS)
  await requireActiveMember(supabase, uid, roomId)
}
