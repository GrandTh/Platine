/**
 * Historique de la playlist d'une room : morceaux qui ont QUITTÉ la file
 * (joués, retirés, ou vidés). Alimenté côté serveur (table `track_history`),
 * lu ici en temps réel pour permettre le re-ajout en un clic.
 *
 * Dédup par (source + external_id) : chaque son n'apparaît qu'une fois, le plus
 * récemment passé en premier.
 */
import type { NewTrack } from '~/composables/useQueue'

interface DbHistory {
  id: string
  title: string
  artist: string
  cover: string
  source: 'youtube' | 'spotify'
  external_id: string
  duration: number | null
  played_at: string
}

export interface HistoryItem {
  title: string
  artist: string
  cover: string
  source: 'youtube' | 'spotify'
  externalId: string
  duration: number | null
  playedAt: number
}

// Plafond de lignes gardées en mémoire / d'items affichés (rooms éphémères).
const ROW_CAP = 300
const SHOW_MAX = 60

export function useHistory(roomId: string) {
  const supabase = useSupabaseClient()
  const rows = ref<DbHistory[]>([])
  let channel: ReturnType<typeof supabase.channel> | null = null

  // Chaque son une seule fois (le plus récent), « - Topic » retiré comme la file.
  const items = computed<HistoryItem[]>(() => {
    const seen = new Set<string>()
    const out: HistoryItem[] = []
    for (const r of rows.value) {
      const key = `${r.source}:${r.external_id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        title: r.title,
        artist: stripTopic(r.artist),
        cover: r.cover || '/sample-cover.svg',
        source: r.source,
        externalId: r.external_id,
        duration: r.duration,
        playedAt: new Date(r.played_at).getTime()
      })
      if (out.length >= SHOW_MAX) break
    }
    return out
  })

  async function fetchAll() {
    const { data } = await supabase
      .from('track_history')
      .select('id, title, artist, cover, source, external_id, duration, played_at')
      .eq('room_id', roomId)
      .order('played_at', { ascending: false })
      .limit(ROW_CAP)
    rows.value = (data ?? []) as DbHistory[]
  }

  onMounted(async () => {
    await fetchAll()
    channel = supabase
      .channel(`history:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'track_history', filter: `room_id=eq.${roomId}` },
        (payload) => {
          rows.value = [payload.new as DbHistory, ...rows.value].slice(0, ROW_CAP)
        }
      )
      .subscribe()
  })

  onBeforeUnmount(() => {
    if (channel) supabase.removeChannel(channel)
    channel = null
  })

  /** Convertit un item d'historique en morceau ajoutable (via useQueue.addTrack). */
  function toNewTrack(h: HistoryItem): NewTrack {
    return {
      title: h.title,
      artist: h.artist,
      cover: h.cover,
      source: h.source,
      externalId: h.externalId,
      duration: h.duration ?? undefined
    }
  }

  return { items, toNewTrack }
}
