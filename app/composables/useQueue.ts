/**
 * File de morceaux + votes, en temps réel via Supabase.
 *
 * L'API publique (addTrack / toggleVote / removeTrack / sorted / nowPlaying)
 * est inchangée par rapport au prototype BroadcastChannel : l'UI ne bouge pas.
 */
import type { Ref } from 'vue'
// seededRank + stripTopic sont partagés client/serveur (auto-importés depuis shared/utils).

interface DbTrack {
  id: string
  room_id: string
  title: string
  artist: string
  cover: string
  source: 'youtube' | 'spotify'
  external_id: string
  added_by: string
  played: boolean
  duration: number | null
  created_at: string
}

interface DbVote {
  track_id: string
  voter_id: string
}

export interface QueueTrack {
  id: string
  title: string
  artist: string
  cover: string
  source: 'youtube' | 'spotify'
  externalId: string
  addedBy: string
  voters: string[]
  createdAt: number
  /** Durée en secondes, si connue. */
  duration: number | null
}

export interface NewTrack {
  title: string
  artist?: string
  cover?: string
  source: 'youtube' | 'spotify'
  externalId: string
  duration?: number
}

export function useQueue(roomId: string, uid: string, shuffleSeed?: Ref<string | null>) {
  const supabase = useSupabaseClient()

  const rows = ref<DbTrack[]>([])
  const votesByTrack = ref<Record<string, string[]>>({})

  function toQueueTrack(r: DbTrack): QueueTrack {
    return {
      id: r.id,
      title: r.title,
      artist: stripTopic(r.artist),
      cover: r.cover || '/sample-cover.svg',
      source: r.source,
      externalId: r.external_id,
      addedBy: r.added_by,
      voters: votesByTrack.value[r.id] ?? [],
      createdAt: new Date(r.created_at).getTime(),
      duration: r.duration
    }
  }

  const tracks = computed<QueueTrack[]>(() => rows.value.map(toQueueTrack))

  // Tri : plus de votes d'abord. À égalité de votes :
  //  - morceaux à 0 vote + shuffle actif → ordre pseudo-aléatoire (seed partagé)
  //  - sinon → le plus ancien d'abord (FIFO).
  // Les morceaux votés gardent donc toujours la priorité sur les 0-vote.
  const sorted = computed(() => {
    const seed = shuffleSeed?.value
    return [...tracks.value].sort((a, b) => {
      if (b.voters.length !== a.voters.length) return b.voters.length - a.voters.length
      if (seed && a.voters.length === 0) {
        return seededRank(a.id, seed) - seededRank(b.id, seed)
      }
      return a.createdAt - b.createdAt
    })
  })

  /** Morceau en tête de file = en lecture. */
  const nowPlaying = computed<QueueTrack | null>(() => sorted.value[0] ?? null)

  function hasVoted(track: QueueTrack) {
    return track.voters.includes(uid)
  }

  // --- Mutations (optimistes + persistées) ---

  /**
   * Ajoute un morceau — sauf s'il est déjà dans la file (même source +
   * external_id). Dans ce cas on vote pour l'existant plutôt que de créer
   * un doublon. Renvoie 'added' ou 'voted' pour informer l'UI.
   *
   * @param withVote  true (défaut) : compte 1 vote pour l'ajouteur.
   *                  false : 0 vote (import playlist = fallback en bas de file).
   * @returns 'voted' (doublon → vote), 'full' (room pleine) ou 'added'.
   */
  async function addTrack(track: NewTrack, withVote = true): Promise<'added' | 'voted' | 'full'> {
    // Écriture via la route serveur (insert anon bloqué par la RLS). Le serveur
    // gère doublon → vote, plafond 200 → 'full', sinon insert + vote.
    try {
      const { status } = await $fetch<{ status: 'added' | 'voted' | 'full' }>('/api/track/add', {
        method: 'POST',
        body: { roomId, uid, track, withVote }
      })
      return status
    } catch {
      return 'added' // best-effort : l'UI ne bloque pas, le Realtime fera foi
    }
  }

  /**
   * Import groupé (playlist) : déléguée à la route serveur (sans vote, dédup,
   * plafond + ordre préservés côté serveur). Renvoie le nombre ajouté.
   */
  async function addMany(list: NewTrack[]) {
    try {
      const { added } = await $fetch<{ added: number }>('/api/track/import', {
        method: 'POST',
        body: { roomId, uid, tracks: list }
      })
      return added
    } catch {
      return 0
    }
  }

  /** Le morceau (source + external_id) est-il déjà dans la file ? */
  function isQueued(source: 'youtube' | 'spotify', externalId: string) {
    return rows.value.some(r => r.source === source && r.external_id === externalId)
  }

  async function toggleVote(trackId: string) {
    const current = votesByTrack.value[trackId] ?? []
    // Optimiste (le DELETE realtime filtré n'arrive pas toujours selon la
    // config REPLICA IDENTITY). Toggle persisté via la route serveur.
    votesByTrack.value = {
      ...votesByTrack.value,
      [trackId]: current.includes(uid) ? current.filter(v => v !== uid) : [...current, uid]
    }
    try {
      await $fetch('/api/vote', { method: 'POST', body: { roomId, uid, trackId } })
    } catch {
      await fetchAll() // refus/échec → resync
    }
  }

  async function removeTrack(trackId: string) {
    // Optimiste : on retire de la liste tout de suite (le DELETE realtime
    // filtré n'arrive pas toujours selon la config REPLICA IDENTITY).
    rows.value = rows.value.filter(r => r.id !== trackId)
    // Suppression via la route serveur (delete anon bloqué par la RLS ;
    // autorisation auteur/hôte vérifiée côté serveur).
    try {
      await $fetch('/api/track/remove', { method: 'POST', body: { roomId, uid, trackId } })
    } catch {
      await fetchAll() // refus/échec → on resynchronise
    }
  }

  /**
   * Vide la file À VENIR : supprime tous les morceaux de la room sauf celui en
   * cours (keepId). Le morceau en lecture continue. Réservé à l'hôte (vérifié
   * côté serveur). Les votes/skip_votes des morceaux retirés partent en cascade.
   */
  async function clearQueue(keepId: string | null) {
    // Optimiste : on ne garde que le morceau en cours.
    rows.value = rows.value.filter(r => r.id === keepId)
    try {
      await $fetch('/api/track/clear', { method: 'POST', body: { roomId, uid, keepId } })
    } catch {
      await fetchAll()
    }
  }

  // --- Chargement initial ---

  async function fetchAll() {
    const { data: t } = await supabase
      .from('tracks')
      .select('*')
      .eq('room_id', roomId)
    rows.value = (t ?? []) as DbTrack[]

    const ids = rows.value.map(r => r.id)
    const map: Record<string, string[]> = {}
    if (ids.length) {
      const { data: v } = await supabase
        .from('votes')
        .select('track_id, voter_id')
        .in('track_id', ids)
      for (const vote of (v ?? []) as DbVote[]) {
        ;(map[vote.track_id] ??= []).push(vote.voter_id)
      }
    }
    votesByTrack.value = map
  }

  // --- Realtime ---

  let channel: ReturnType<typeof supabase.channel> | null = null

  // Resync débouncé : plusieurs events rapprochés (rafale de votes, import de
  // playlist…) ne déclenchent qu'UN seul fetchAll → bien moins de requêtes.
  let syncTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleSync() {
    if (syncTimer) return
    syncTimer = setTimeout(() => {
      syncTimer = null
      fetchAll()
    }, 250)
  }

  // Un événement `votes` ne concerne notre room que si son track_id est l'un de
  // nos morceaux. La table `votes` n'a pas de room_id → l'abonnement est global ;
  // on filtre ici pour ignorer les votes des AUTRES rooms (évite une tempête de
  // refetch chez tous les clients à chaque vote ailleurs).
  function voteConcernsRoom(payload: { new?: unknown, old?: unknown }): boolean {
    const rec = (payload.new ?? payload.old) as { track_id?: string } | undefined
    const trackId = rec?.track_id
    // track_id inconnu (payload incomplet) → on resync par sécurité.
    if (!trackId) return true
    return rows.value.some(r => r.id === trackId)
  }

  onMounted(async () => {
    await fetchAll()

    channel = supabase
      .channel(`room:${roomId}`)
      // Morceaux de cette room (déjà filtré par room côté serveur).
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tracks', filter: `room_id=eq.${roomId}` },
        () => scheduleSync()
      )
      // Votes : abonnement global (pas de room_id en DB) → on ignore ceux des
      // autres rooms, et on débounce le reste.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes' },
        (payload) => { if (voteConcernsRoom(payload)) scheduleSync() }
      )
      .subscribe()
  })

  onBeforeUnmount(() => {
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = null
    if (channel) supabase.removeChannel(channel)
    channel = null
  })

  return {
    tracks,
    sorted,
    nowPlaying,
    addTrack,
    addMany,
    toggleVote,
    removeTrack,
    clearQueue,
    hasVoted,
    isQueued
  }
}
