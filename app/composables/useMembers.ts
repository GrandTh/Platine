import type { Ref } from 'vue'
import { COLOR_PALETTE, userColor, shortId } from '~/composables/useUserColor'

/**
 * Membres d'une room (présence + nom), en temps réel via Supabase.
 *
 * - À l'arrivée : upsert de sa propre ligne ; un heartbeat rafraîchit
 *   `last_seen` (présence). On considère "présent" = vu il y a < 1 min.
 * - Le nom est personnalisable (rename) ; sinon on affiche un ID court.
 * - Couleur : assignée par ordre d'arrivée (created_at) → unique tant qu'il
 *   y a moins de membres que de couleurs dans la palette (pas de collision,
 *   contrairement à un simple hash de l'uid).
 */

const HEARTBEAT_MS = 20_000
const PRESENT_WINDOW_MS = 60_000

// Avatars animaux (code-points Twemoji) attribués par rang d'arrivée, comme
// les couleurs → chaque membre a un animal unique et identique pour tous.
const ANIMALS = [
  '1f436', '1f431', '1f98a', '1f43c', '1f981', '1f42f', '1f428', '1f438',
  '1f435', '1f989', '1f427', '1f984', '1f419', '1f99d', '1f43a', '1f994',
  '1f430', '1f43b', '1f42e', '1f437', '1f985', '1f98b', '1f422', '1f988',
  '1f42c', '1f433', '1f414', '1f439', '1f42d', '1f9a5'
]
// Pseudo mémorisé entre les rooms / sessions (par navigateur).
const NAME_KEY = 'platine:name'

function readSavedName(): string | null {
  if (!import.meta.client) return null
  return localStorage.getItem(NAME_KEY)?.trim() || null
}

interface DbMember {
  uid: string
  name: string | null
  last_seen: string
  created_at: string
}

export interface Member {
  uid: string
  name: string
  color: string
  /** Code-point Twemoji de l'avatar animal */
  emoji: string
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

  // Membres présents (vus récemment), nom résolu + couleur unique.
  const members = computed<Member[]>(() => {
    const present = rows.value.filter(
      m => now.value - new Date(m.last_seen).getTime() < PRESENT_WINDOW_MS
    )
    // Couleur par rang d'arrivée (created_at, départage par uid) → unique tant
    // que le nb de membres ≤ taille de la palette. Au-delà, repli sur le hash.
    const ranked = [...present].sort((a, b) =>
      a.created_at.localeCompare(b.created_at) || a.uid.localeCompare(b.uid)
    )
    const colorByUid = new Map<string, string>()
    const emojiByUid = new Map<string, string>()
    ranked.forEach((m, i) => {
      colorByUid.set(m.uid, i < COLOR_PALETTE.length ? COLOR_PALETTE[i]! : userColor(m.uid))
      emojiByUid.set(m.uid, ANIMALS[i % ANIMALS.length]!)
    })

    return present
      .map(m => ({
        uid: m.uid,
        name: m.name?.trim() || shortId(m.uid),
        color: colorByUid.get(m.uid)!,
        emoji: emojiByUid.get(m.uid)!,
        isSelf: m.uid === uid
      }))
      .sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.name.localeCompare(b.name)))
  })

  const myName = computed(() => members.value.find(m => m.isSelf)?.name ?? shortId(uid))

  // Couleur d'un participant par son uid : SOURCE UNIQUE de couleur.
  // Si le membre est présent → sa couleur (par rang, unique) ; sinon repli sur
  // le hash de l'uid. Utilisée pour la pastille du membre ET pour la couleur de
  // ses morceaux, afin qu'elles correspondent toujours.
  function colorFor(targetUid: string): string {
    return members.value.find(m => m.uid === targetUid)?.color ?? userColor(targetUid)
  }

  async function fetchAll() {
    const { data } = await supabase
      .from('members')
      .select('uid, name, last_seen, created_at')
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
    // Réapplique le pseudo mémorisé (localStorage) à l'arrivée dans la room.
    const saved = readSavedName()
    await supabase.from('members').upsert({
      room_id: roomId,
      uid,
      last_seen: new Date().toISOString(),
      ...(saved ? { name: saved } : {})
    })
  }

  async function rename(name: string) {
    const clean = name.trim().slice(0, 24)
    // Mémorise le pseudo pour les prochaines rooms / sessions.
    if (import.meta.client) {
      if (clean) localStorage.setItem(NAME_KEY, clean)
      else localStorage.removeItem(NAME_KEY)
    }
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

  return { members, myName, rename, colorFor }
}
