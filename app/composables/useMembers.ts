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
    ranked.forEach((m, i) => {
      colorByUid.set(m.uid, i < COLOR_PALETTE.length ? COLOR_PALETTE[i]! : userColor(m.uid))
    })

    return present
      .map(m => ({
        uid: m.uid,
        name: m.name?.trim() || shortId(m.uid),
        color: colorByUid.get(m.uid)!,
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

  // Écritures membres via les routes serveur (insert/update/delete anon bloqués
  // par la RLS). Best-effort : on n'interrompt pas l'UX si un appel échoue.
  async function heartbeat() {
    try {
      await $fetch('/api/member', { method: 'POST', body: { action: 'heartbeat', roomId, uid } })
    } catch { /* présence best-effort */ }
  }

  async function join() {
    // Réapplique le pseudo mémorisé (localStorage) à l'arrivée dans la room.
    try {
      await $fetch('/api/member', {
        method: 'POST',
        body: { action: 'join', roomId, uid, name: readSavedName() ?? undefined }
      })
    } catch { /* best-effort */ }
  }

  async function rename(name: string) {
    const clean = name.trim().slice(0, 24)
    // Mémorise le pseudo pour les prochaines rooms / sessions.
    if (import.meta.client) {
      if (clean) localStorage.setItem(NAME_KEY, clean)
      else localStorage.removeItem(NAME_KEY)
    }
    try {
      await $fetch('/api/member', { method: 'POST', body: { action: 'rename', roomId, uid, name: clean } })
    } catch { /* best-effort */ }
  }

  // Retrait de soi-même (départ propre, navigation interne).
  function leave() {
    return $fetch('/api/member/leave', { method: 'POST', body: { roomId, uid } }).catch(() => {})
  }

  // Retrait à la fermeture de l'onglet/navigateur. keepalive:true survit à
  // l'unload (comme sendBeacon) ; on cible notre route serveur.
  function leaveOnUnload() {
    fetch('/api/member/leave', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, uid })
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
