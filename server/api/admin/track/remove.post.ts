/**
 * Admin : retire un morceau de N'IMPORTE QUELLE room. Réservé aux admins
 * (requireAdmin : session + 2FA aal2 + allowlist). Service role.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireAdmin(event)
  const body = await readBody(event)
  const trackId = (body?.trackId as string | undefined)?.trim()
  if (!trackId) throw createError({ statusCode: 400, statusMessage: 'trackId requis' })

  const supabase = serverSupabaseServiceRole<Database>(event)
  // Historique avant suppression (re-ajout possible depuis l'onglet Historique).
  const { data: track } = await supabase
    .from('tracks').select(HISTORY_SELECT).eq('id', trackId).maybeSingle()
  if (track) await recordHistory(supabase, [track])
  await supabase.from('tracks').delete().eq('id', trackId)
  return { ok: true }
})
