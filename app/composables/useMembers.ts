import type { Ref } from 'vue'
import { userColor, shortId } from '~/composables/useUserColor'

/**
 * Membres d'une room (présence + nom), en temps réel via Supabase.
 *
 * - À l'arrivée : upsert de sa propre ligne ; un heartbeat rafraîchit
 *   `last_seen` (présence). On considère "présent" = vu il y a < 1 min.
 * - Le nom est personnalisable (rename) ; sinon on affiche un ID court.
 * - La couleur est dérivée de l'uid (non stockée).
 */

const HEARTBEAT_MS = 20_000
const PRESENT_WINDOW_MS = 60_000

interface DbMember {
  uid: string
  name: string | null
  last_seen: string
}

export interface Member {
  uid: string
  name: string
  color: string
  isSelf: boolean
}

export function useMembers(roomId: string, uid: string, ready: Ref<boolean>) {
  const supabase = useSupabaseClient()
  const rows = ref<DbMember[]>([])
  // Horodatage réactif : force le recalcul de `members` à intervalle régulier
  // pour que les membres partis (last_seen périmé) disparaissent tout seuls.
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null
  let tick: ReturnType<typeof setInterval> | null = null
  let channel: ReturnType<typeof supabase.channel> | null = null

  // Membres présents (vus récemment), nom résolu + couleur.
  const members = computed<Member[]>(() => {
    return rows.value
      .filter(m => now.value - new Date(m.last_seen).getTime() < PRESENT_WINDOW_MS)
      .map(m => ({
        uid: m.uid,
        name: m.name?.trim() || shortId(m.uid),
        color: userColor(m.uid),
        isSelf: m.uid === uid
      }))
      .sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.name.localeCompare(b.name)))
  })

  const myName = computed(() => members.value.find(m => m.isSelf)?.name ?? shortId(uid))

  async function fetchAll() {
    const { data } = await supabase
      .from('members')
      .select('uid, name, last_seen')
      .eq('room_id', roomId)
    rows.value = (data ?? []) as DbMember[]
  }

  async function heartbeat() {
    await supabase
      .from('members')
      .update({ last_seen: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('uid', uid)
  }

  async function join() {
    await supabase.from('members').upsert({
      room_id: roomId,
      uid,
      last_seen: new Date().toISOString()
    })
  }

  async function rename(name: string) {
    const clean = name.trim().slice(0, 24)
    await supabase
      .from('members')
      .update({ name: clean || null })
      .eq('room_id', roomId)
      .eq('uid', uid)
  }

  // Retrait de soi-même (départ propre, navigation interne).
  function leave() {
    return supabase.from('members').delete().eq('room_id', roomId).eq('uid', uid)
  }

  // Retrait à la fermeture de l'onglet/navigateur. Une requête fetch normale
  // est tuée avant de partir → on utilise keepalive:true, qui survit à
  // l'unload (comme sendBeacon mais avec headers pour l'API REST Supabase).
  function leaveOnUnload() {
    const cfg = useRuntimeConfig().public.supabase as { url: string, key: string }
    if (!cfg?.url || !cfg?.key) return
    const endpoint = `${cfg.url}/rest/v1/members?room_id=eq.${encodeURIComponent(roomId)}&uid=eq.${encodeURIComponent(uid)}`
    fetch(endpoint, {
      method: 'DELETE',
      keepalive: true,
      headers: {
        apikey: cfg.key,
        authorization: `Bearer ${cfg.key}`
      }
    }).catch(() => {})
  }

  // Attend que la room existe (ready) avant de s'inscrire : la FK members→rooms
  // rejetterait l'insert si la room n'est pas encore créée (cas de l'hôte).
  async function start() {
    await join()
    await fetchAll()
    timer = setInterval(heartbeat, HEARTBEAT_MS)
    // Recalcule la présence + refetch périodique → les membres partis
    // (last_seen périmé) disparaissent même sans event.
    tick = setInterval(() => {
      now.value = Date.now()
      fetchAll()
    }, 15_000)

    channel = supabase
      .channel(`members:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `room_id=eq.${roomId}` },
        () => fetchAll()
      )
      .subscribe()
  }

  function onUnload() {
    leaveOnUnload()
  }

  onMounted(() => {
    window.addEventListener('beforeunload', onUnload)
    if (ready.value) {
      start()
    } else {
      const stop = watch(ready, (ok) => {
        if (ok) {
          stop()
          start()
        }
      })
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onUnload)
    if (timer) clearInterval(timer)
    timer = null
    if (tick) clearInterval(tick)
    tick = null
    if (channel) supabase.removeChannel(channel)
    channel = null
    // Départ via navigation interne (retour accueil, etc.)
    leave()
  })

  return { members, myName, rename }
}
