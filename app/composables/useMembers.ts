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
  let timer: ReturnType<typeof setInterval> | null = null
  let channel: ReturnType<typeof supabase.channel> | null = null

  // Membres présents (vus récemment), nom résolu + couleur.
  const members = computed<Member[]>(() => {
    const now = Date.now()
    return rows.value
      .filter(m => now - new Date(m.last_seen).getTime() < PRESENT_WINDOW_MS)
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

  // Attend que la room existe (ready) avant de s'inscrire : la FK members→rooms
  // rejetterait l'insert si la room n'est pas encore créée (cas de l'hôte).
  async function start() {
    await join()
    await fetchAll()
    timer = setInterval(heartbeat, HEARTBEAT_MS)

    channel = supabase
      .channel(`members:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `room_id=eq.${roomId}` },
        () => fetchAll()
      )
      .subscribe()
  }

  onMounted(() => {
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
    if (timer) clearInterval(timer)
    timer = null
    if (channel) supabase.removeChannel(channel)
    channel = null
  })

  return { members, myName, rename }
}
