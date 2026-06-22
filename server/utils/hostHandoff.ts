/**
 * Passation d'hôte (host handoff) — réconciliation côté serveur, appelée de
 * façon opportuniste à chaque heartbeat/join/leave de membre (clé service role,
 * donc autoritaire). Aucune dépendance à un cron.
 *
 * Règles :
 *  - Le PROPRIÉTAIRE (owner_id, créateur) est hôte dès qu'il est présent : il
 *    reprend toujours la main à son retour (et garde sa place s'il revient
 *    pendant la grâce).
 *  - S'il est absent depuis > 3 min, l'hôte ACTIF (host_id) passe au membre
 *    présent le plus ancien (par ordre d'arrivée), hors propriétaire. Si cet
 *    hôte de remplacement part à son tour, le suivant prend le relais.
 *
 * Fail-open : en cas d'erreur DB, on ne casse rien (best-effort au call site).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

// Grâce : le propriétaire a 3 min pour revenir avant la passation.
const HOST_GRACE_MS = 3 * 60_000
// Présence : membre vu il y a moins de ~45 s (heartbeat client = 20 s).
const PRESENT_MS = 45_000

export async function reconcileHost(
  supabase: SupabaseClient<Database>,
  roomId: string
): Promise<void> {
  const { data: room } = await supabase
    .from('rooms')
    .select('owner_id, host_id, host_absent_since')
    .eq('id', roomId)
    .maybeSingle()
  if (!room) return

  // Rooms d'avant la feature : pas d'owner_id → l'hôte courant fait foi.
  const owner = room.owner_id ?? room.host_id
  if (!owner) return

  const presentSince = new Date(Date.now() - PRESENT_MS).toISOString()

  const { data: ownerRow } = await supabase
    .from('members')
    .select('uid')
    .eq('room_id', roomId)
    .eq('uid', owner)
    .gt('last_seen', presentSince)
    .maybeSingle()

  // --- Propriétaire présent : il (re)prend la main, on annule le chrono. ---
  if (ownerRow) {
    const patch: Database['public']['Tables']['rooms']['Update'] = {}
    if (room.host_id !== owner) patch.host_id = owner
    if (room.host_absent_since !== null) patch.host_absent_since = null
    if (Object.keys(patch).length) {
      await supabase.from('rooms').update(patch).eq('id', roomId)
    }
    return
  }

  // --- Propriétaire absent : démarre le chrono de grâce si besoin. ---
  if (!room.host_absent_since) {
    await supabase
      .from('rooms')
      .update({ host_absent_since: new Date().toISOString() })
      .eq('id', roomId)
    return
  }

  // --- Grâce écoulée : passe au plus ancien membre présent (hors proprio). ---
  if (Date.now() - new Date(room.host_absent_since).getTime() >= HOST_GRACE_MS) {
    const { data: candidates } = await supabase
      .from('members')
      .select('uid')
      .eq('room_id', roomId)
      .neq('uid', owner)
      .gt('last_seen', presentSince)
      .order('created_at', { ascending: true })
      .limit(1)
    const next = candidates?.[0]?.uid
    if (next && next !== room.host_id) {
      await supabase.from('rooms').update({ host_id: next }).eq('id', roomId)
    }
  }
}
