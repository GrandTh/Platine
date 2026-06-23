/**
 * Cycle de vie d'une room.
 *
 * Règle : la room vit tant qu'AU MOINS une personne est présente. Le heartbeat
 * de présence est porté par useMembers (/api/member heartbeat), qui rafraîchit
 * aussi `rooms.last_active` côté serveur → pas d'écriture `rooms` côté client.
 * Quand plus personne ne heartbeate, la room devient « vide » et le cleanup
 * serveur (cron) la supprime.
 *
 * Sécurité du rôle : le rôle d'hôte vient UNIQUEMENT de la DB (host_id), et
 * TOUTES les écritures `rooms` passent par des endpoints service role
 * (`/api/room/*`). La RLS interdit l'écriture anon sur `rooms` (migration 18)
 * → impossible de voler le rôle ou de piloter la lecture par écriture directe.
 *
 * État `playing` : partagé en temps réel (pause/play se propage à tous).
 */

export type RoomMode = 'speaker' | 'each'

export function useRoomLifecycle(
  roomId: string,
  uid: string,
  wantHost: boolean,
  mode: RoomMode
) {
  const supabase = useSupabaseClient()
  const exists = ref(true)
  const ready = ref(false)
  const roomMode = ref<RoomMode>(mode)
  const isHost = ref(false)
  const hostId = ref<string | null>(null)
  const playing = ref(true)
  const currentTrackId = ref<string | null>(null)
  const shuffleSeed = ref<string | null>(null)
  let channel: ReturnType<typeof supabase.channel> | null = null

  /** Crée la room si absente — via la route serveur (l'insert anon direct est
   *  bloqué par la RLS). La route est idempotente et rate-limitée par IP.
   *  En cas d'échec (ex. 429 anti-spam), on n'insère pas : loadRoom verra que
   *  la room n'existe pas et l'UI affichera l'état "room introuvable". */
  async function createIfAbsent() {
    try {
      await $fetch('/api/room/ensure', {
        method: 'POST',
        body: { roomId, uid, mode }
      })
    } catch {
      // silencieux : exists=false sera géré par loadRoom.
    }
  }

  async function loadRoom() {
    const { data } = await supabase
      .from('rooms')
      .select('host_id, mode, playing, current_track_id, shuffle_seed')
      .eq('id', roomId)
      .maybeSingle()
    if (data) {
      exists.value = true
      roomMode.value = data.mode
      hostId.value = data.host_id
      isHost.value = data.host_id === uid
      playing.value = data.playing
      currentTrackId.value = data.current_track_id
      shuffleSeed.value = data.shuffle_seed
    } else {
      exists.value = false
    }
  }

  // Écriture de l'état room via la route serveur (l'update anon est bloqué par
  // la RLS ; l'autorisation hôte est revérifiée côté serveur). Optimiste côté
  // client, le Realtime fait foi. Best-effort : on n'interrompt pas l'UX.
  function pushState(patch: { playing?: boolean, currentTrackId?: string | null, shuffleSeed?: string }) {
    return $fetch('/api/room/state', { method: 'POST', body: { roomId, uid, ...patch } }).catch(() => {})
  }

  /** Bascule lecture/pause (hôte uniquement). Propagé via Realtime. */
  async function togglePlaying() {
    if (!isHost.value) return
    const next = !playing.value
    playing.value = next // optimiste
    await pushState({ playing: next })
  }

  /** Définit le morceau en cours (hôte uniquement). Propagé via Realtime. */
  async function setCurrentTrack(trackId: string | null) {
    if (!isHost.value) return
    currentTrackId.value = trackId // optimiste
    await pushState({ currentTrackId: trackId })
  }

  /** Re-mélange les morceaux à 0 vote (hôte uniquement) : nouvelle graine,
   *  propagée à tous via Realtime → tout le monde re-trie pareil. */
  async function reshuffle() {
    if (!isHost.value) return
    const seed = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
    shuffleSeed.value = seed // optimiste
    await pushState({ shuffleSeed: seed })
  }

  onMounted(async () => {
    if (wantHost) await createIfAbsent()
    await loadRoom()
    if (exists.value) subscribeRoom()
    ready.value = true
  })

  // Callback déclenché à la réception d'un seek de l'hôte (positionné par la page).
  let onSeekReceived: ((seconds: number) => void) | null = null
  function onSeek(cb: (seconds: number) => void) {
    onSeekReceived = cb
  }

  /** L'hôte diffuse un seek à tous (broadcast léger, pas de persistance). */
  function broadcastSeek(seconds: number) {
    if (!isHost.value || !channel) return
    channel.send({ type: 'broadcast', event: 'seek', payload: { seconds } })
  }

  // Suit les changements de la room (`playing`) + les seeks (broadcast).
  function subscribeRoom() {
    channel = supabase
      .channel(`room-state:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { playing?: boolean, current_track_id?: string | null, shuffle_seed?: string | null, host_id?: string }
          if (typeof row.playing === 'boolean') playing.value = row.playing
          if ('current_track_id' in row) currentTrackId.value = row.current_track_id ?? null
          if ('shuffle_seed' in row) shuffleSeed.value = row.shuffle_seed ?? null
          // Passation d'hôte : le rôle peut changer en direct (proprio absent →
          // reprise par un invité, ou retour du proprio). On bascule l'UI.
          if (typeof row.host_id === 'string') {
            hostId.value = row.host_id
            isHost.value = row.host_id === uid
          }
        }
      )
      .on('broadcast', { event: 'seek' }, ({ payload }) => {
        const s = (payload as { seconds?: number })?.seconds
        if (typeof s === 'number') onSeekReceived?.(s)
      })
      .subscribe()
  }

  onBeforeUnmount(() => {
    if (channel) supabase.removeChannel(channel)
    channel = null
  })

  return {
    exists, ready, mode: roomMode, isHost, hostId,
    playing, togglePlaying, broadcastSeek, onSeek,
    currentTrackId, setCurrentTrack, shuffleSeed, reshuffle
  }
}
