/**
 * Cycle de vie d'une room.
 *
 * Règle : la room vit tant qu'AU MOINS une personne est présente.
 * Chaque participant (hôte ou invité) rafraîchit `last_active` via un
 * heartbeat régulier. Quand plus personne ne heartbeate, la room devient
 * « vide » et le cleanup serveur (cron horaire) la supprime.
 *
 * Un refresh ne tue pas la room : le client se reconnecte et re-heartbeate
 * bien avant l'expiration du délai de grâce.
 *
 * - Hôte : crée la room si absente, puis heartbeat.
 * - Invité : vérifie que la room existe ; si oui, heartbeat aussi (il
 *   participe donc à la maintenir en vie).
 */

const HEARTBEAT_MS = 20_000

export function useRoomLifecycle(
  roomId: string,
  uid: string,
  isHost: boolean,
  source: 'youtube' | 'both'
) {
  const supabase = useSupabaseClient()
  const exists = ref(true)
  let timer: ReturnType<typeof setInterval> | null = null

  async function heartbeat() {
    await supabase
      .from('rooms')
      .update({ last_active: new Date().toISOString() })
      .eq('id', roomId)
  }

  async function ensureRoom() {
    // upsert : crée la room ou rafraîchit son activité si elle existe déjà.
    await supabase.from('rooms').upsert({
      id: roomId,
      host_id: uid,
      source,
      last_active: new Date().toISOString()
    })
  }

  async function checkRoom() {
    const { data } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', roomId)
      .maybeSingle()
    exists.value = !!data
  }

  function startHeartbeat() {
    timer = setInterval(heartbeat, HEARTBEAT_MS)
  }

  onMounted(async () => {
    if (isHost) {
      await ensureRoom()
      startHeartbeat()
    } else {
      await checkRoom()
      // L'invité ne crée jamais la room, mais s'il la trouve il la maintient en vie.
      if (exists.value) startHeartbeat()
    }
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    timer = null
  })

  return { exists }
}
