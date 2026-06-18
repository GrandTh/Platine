import type { Ref } from 'vue'
import type { Member } from '~/composables/useMembers'

/**
 * Vote pour skip le morceau en cours, en temps réel via Supabase.
 *
 * - Un vote par personne et par morceau (table skip_votes).
 * - Quorum = ceil(50% des INVITÉS présents) — l'hôte est exclu (il a son
 *   skip manuel) ; minimum 1.
 * - Quand le quorum est atteint, c'est l'HÔTE qui exécute le skip (autorité
 *   unique) via le callback onQuorum → évite les doubles skips.
 * - Reset automatique quand le morceau change (les votes du morceau retiré
 *   sont de toute façon supprimés en cascade côté DB).
 */

interface DbSkipVote {
  voter_id: string
  track_id: string
}

export function useSkipVote(
  roomId: string,
  uid: string,
  currentTrackId: Ref<string | null>,
  members: Ref<Member[]>
) {
  const supabase = useSupabaseClient()
  const rows = ref<DbSkipVote[]>([])
  let channel: ReturnType<typeof supabase.channel> | null = null

  // Votes du morceau actuellement en lecture uniquement.
  const skipVoters = computed(() =>
    rows.value.filter(r => r.track_id === currentTrackId.value).map(r => r.voter_id)
  )
  const skipCount = computed(() => skipVoters.value.length)
  const hasVotedSkip = computed(() => skipVoters.value.includes(uid))

  // Quorum : 50% de TOUTE la room (hôte inclus dans le total), arrondi au
  // sup., min 1. L'hôte compte dans le total mais ne vote pas (skip manuel).
  // Ex. room de 3 (1 hôte + 2 invités) → ceil(3/2) = 2 votes requis.
  const quorum = computed(() => Math.max(1, Math.ceil(members.value.length / 2)))

  // Dernier votant (pour le texte du toast), résolu en nom via members.
  const lastVoterUid = ref<string | null>(null)
  const lastVoterName = computed(() => {
    const m = members.value.find(x => x.uid === lastVoterUid.value)
    return m?.name ?? null
  })
  const lastVoterColor = computed(() => {
    const m = members.value.find(x => x.uid === lastVoterUid.value)
    return m?.color ?? '#ffffff'
  })

  const active = computed(() => skipCount.value > 0)

  async function fetchAll() {
    const { data } = await supabase
      .from('skip_votes')
      .select('voter_id, track_id')
      .eq('room_id', roomId)
    rows.value = (data ?? []) as DbSkipVote[]
  }

  /** Ajoute ou retire son vote skip (toggle). Persisté via la route serveur
   *  (insert/delete anon bloqués par la RLS). Optimiste côté client. */
  async function toggleSkipVote() {
    const trackId = currentTrackId.value
    if (!trackId) return
    if (hasVotedSkip.value) {
      rows.value = rows.value.filter(r => !(r.track_id === trackId && r.voter_id === uid))
    } else {
      rows.value = [...rows.value, { track_id: trackId, voter_id: uid }]
      lastVoterUid.value = uid
    }
    try {
      await $fetch('/api/skip-vote', { method: 'POST', body: { roomId, uid, trackId } })
    } catch {
      await fetchAll() // refus/échec → resync
    }
  }

  // Callback déclenché (chez l'hôte) quand le quorum est atteint.
  let onQuorumCb: (() => void) | null = null
  function onQuorum(cb: () => void) {
    onQuorumCb = cb
  }

  // Surveille l'atteinte du quorum.
  watch([skipCount, quorum, currentTrackId], () => {
    if (currentTrackId.value && skipCount.value >= quorum.value && skipCount.value > 0) {
      onQuorumCb?.()
    }
  })

  onMounted(async () => {
    await fetchAll()
    channel = supabase
      .channel(`skip:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'skip_votes', filter: `room_id=eq.${roomId}` },
        (payload) => {
          // Mémorise le dernier votant pour le toast.
          if (payload.eventType === 'INSERT') {
            const v = payload.new as DbSkipVote
            if (v.track_id === currentTrackId.value) lastVoterUid.value = v.voter_id
          }
          fetchAll()
        }
      )
      .subscribe()
  })

  onBeforeUnmount(() => {
    if (channel) supabase.removeChannel(channel)
    channel = null
  })

  return {
    skipVoters,
    skipCount,
    hasVotedSkip,
    quorum,
    active,
    lastVoterName,
    lastVoterColor,
    toggleSkipVote,
    onQuorum
  }
}
