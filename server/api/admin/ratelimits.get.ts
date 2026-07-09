/**
 * Admin : IP actuellement rate-limitées + temps restant avant « libération ».
 * Réservé aux admins (requireAdmin). Lecture seule, service role.
 *
 * Source : table `rate_limit` (bucket = `action:fenêtre:ip`, count, expires_at).
 * `rl_hit` incrémente `count` à CHAQUE tentative (même refusée) et bloque quand
 * `count > limite` → une fenêtre est « dépassée » quand `count > limite`.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'
import type { AdminRateLimit } from '~/types/admin'

// Plafonds par `action:fenêtre`. DOIT rester synchro avec les endpoints /api/*
// (les limites y sont définies au cas par cas). Une entrée absente ici = non
// évaluée (pas affichée comme bloquée).
const LIMITS: Record<string, number> = {
  'room:1m': 5, 'room:1h': 30,
  'room-state:1m': 120,
  'vote:1m': 60,
  'skip-vote:1m': 30,
  'track-add:1m': 30, 'track-add:1h': 200,
  'track-import:1m': 5, 'track-import:1h': 30,
  'track-remove:1m': 40,
  'track-clear:1m': 10,
  'member-join:1m': 30, 'member-join:1h': 200,
  'member-hb:1m': 60,
  'member-rename:1m': 15,
  'member-moderate:1m': 60,
  'search:10s': 8, 'search:5m': 40,
  'video:10s': 8, 'video:5m': 40,
  'playlist:10s': 8, 'playlist:5m': 40
}

export default defineEventHandler(async (event): Promise<AdminRateLimit[]> => {
  await requireAdmin(event)
  const supabase = serverSupabaseServiceRole<Database>(event)

  const { data } = await supabase
    .from('rate_limit')
    .select('bucket, count, expires_at')
    .gt('expires_at', new Date().toISOString())

  // Regroupe par IP les fenêtres DÉPASSÉES (count > limite connue).
  const byIp = new Map<string, AdminRateLimit>()
  for (const row of data ?? []) {
    const parts = row.bucket.split(':')
    if (parts.length < 3) continue
    const action = parts[0]!
    const window = parts[1]!
    const ip = parts.slice(2).join(':') // une IPv6 peut contenir des « : »
    const limit = LIMITS[`${action}:${window}`]
    if (limit === undefined || row.count <= limit) continue // pas (ou plus) bloqué

    const entry = byIp.get(ip) ?? { ip, blocks: [] }
    entry.blocks.push({ action, window, count: row.count, limit, expiresAt: row.expires_at })
    byIp.set(ip, entry)
  }

  // Les IP dont la fenêtre se libère le plus tard d'abord.
  const latest = (e: AdminRateLimit) =>
    Math.max(...e.blocks.map(b => new Date(b.expiresAt).getTime()))
  return [...byIp.values()].sort((a, b) => latest(b) - latest(a))
})
