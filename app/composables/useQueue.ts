/**
 * File de morceaux + votes, en temps réel via Supabase.
 *
 * L'API publique (addTrack / toggleVote / removeTrack / sorted / nowPlaying)
 * est inchangée par rapport au prototype BroadcastChannel : l'UI ne bouge pas.
 */

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
}

export interface NewTrack {
  title: string
  artist?: string
  cover?: string
  source: 'youtube' | 'spotify'
  externalId: string
}

export function useQueue(roomId: string, uid: string) {
  const supabase = useSupabaseClient()

  const rows = ref<DbTrack[]>([])
  const votesByTrack = ref<Record<string, string[]>>({})

  function toQueueTrack(r: DbTrack): QueueTrack {
    return {
      id: r.id,
      title: r.title,
      artist: r.artist,
      cover: r.cover || '/sample-cover.svg',
      source: r.source,
      externalId: r.external_id,
      addedBy: r.added_by,
      voters: votesByTrack.value[r.id] ?? [],
      createdAt: new Date(r.created_at).getTime()
    }
  }

  const tracks = computed<QueueTrack[]>(() => rows.value.map(toQueueTrack))

  // Tri : plus de votes d'abord, puis le plus ancien (FIFO à égalité).
  const sorted = computed(() =>
    [...tracks.value].sort((a, b) =>
      b.voters.length - a.voters.length || a.createdAt - b.createdAt
    )
  )

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
   */
  async function addTrack(track: NewTrack, withVote = true): Promise<'added' | 'voted'> {
    const existing = rows.value.find(
      r => r.source === track.source && r.external_id === track.externalId
    )
    if (existing) {
      if (withVote && !(votesByTrack.value[existing.id] ?? []).includes(uid)) {
        await supabase.from('votes').insert({ track_id: existing.id, voter_id: uid })
      }
      return 'voted'
    }

    const { data, error } = await supabase
      .from('tracks')
      .insert({
        room_id: roomId,
        title: track.title,
        artist: track.artist ?? '',
        cover: track.cover ?? '',
        source: track.source,
        external_id: track.externalId,
        added_by: uid
      })
      .select()
      .single()

    if (error || !data) return 'added'
    if (withVote) {
      await supabase.from('votes').insert({ track_id: (data as DbTrack).id, voter_id: uid })
    }
    return 'added'
  }

  /**
   * Import groupé (playlist) : ajoute plusieurs morceaux SANS vote (fallback),
   * en ignorant les doublons. Un seul fetchAll à la fin via le Realtime.
   */
  async function addMany(list: NewTrack[]) {
    const existingKeys = new Set(rows.value.map(r => `${r.source}:${r.external_id}`))
    const toInsert = list
      .filter(t => !existingKeys.has(`${t.source}:${t.externalId}`))
      .map(t => ({
        room_id: roomId,
        title: t.title,
        artist: t.artist ?? '',
        cover: t.cover ?? '',
        source: t.source,
        external_id: t.externalId,
        added_by: uid
      }))
    if (toInsert.length) {
      await supabase.from('tracks').insert(toInsert) // aucun vote → 0 par défaut
    }
    return toInsert.length
  }

  /** Le morceau (source + external_id) est-il déjà dans la file ? */
  function isQueued(source: 'youtube' | 'spotify', externalId: string) {
    return rows.value.some(r => r.source === source && r.external_id === externalId)
  }

  async function toggleVote(trackId: string) {
    const current = votesByTrack.value[trackId] ?? []
    if (current.includes(uid)) {
      // Optimiste : retire le vote localement (le DELETE realtime filtré
      // peut ne pas revenir si REPLICA IDENTITY FULL n'est pas actif).
      votesByTrack.value = {
        ...votesByTrack.value,
        [trackId]: current.filter(v => v !== uid)
      }
      await supabase.from('votes').delete().eq('track_id', trackId).eq('voter_id', uid)
    } else {
      votesByTrack.value = { ...votesByTrack.value, [trackId]: [...current, uid] }
      await supabase.from('votes').insert({ track_id: trackId, voter_id: uid })
    }
  }

  async function removeTrack(trackId: string) {
    // Optimiste : on retire de la liste tout de suite (le DELETE realtime
    // filtré n'arrive pas toujours selon la config REPLICA IDENTITY).
    rows.value = rows.value.filter(r => r.id !== trackId)
    await supabase.from('tracks').delete().eq('id', trackId)
  }

  /**
   * Vide la file À VENIR : supprime tous les morceaux de la room sauf celui en
   * cours (keepId). Le morceau en lecture continue. Réservé à l'hôte (côté UI).
   * Les votes/skip_votes des morceaux retirés partent en cascade (DB).
   */
  async function clearQueue(keepId: string | null) {
    // Optimiste : on ne garde que le morceau en cours.
    rows.value = rows.value.filter(r => r.id === keepId)
    let query = supabase.from('tracks').delete().eq('room_id', roomId)
    if (keepId) query = query.neq('id', keepId)
    await query
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

  onMounted(async () => {
    await fetchAll()

    channel = supabase
      .channel(`room:${roomId}`)
      // Morceaux de cette room
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tracks', filter: `room_id=eq.${roomId}` },
        () => fetchAll()
      )
      // Votes : pas filtrables par room côté serveur → on resynchronise.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes' },
        () => fetchAll()
      )
      .subscribe()
  })

  onBeforeUnmount(() => {
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
