import type { SearchResult } from '~~/server/api/search.get'
import type { RecommendedPlaylist } from '~/utils/recommendedPlaylists'

/**
 * Recherche YouTube côté client, déclenchée À LA VALIDATION (Entrée), pas en
 * live : search.list coûte 100 unités de quota → on ne cherche que sur une
 * intention explicite (1 recherche = 1 Entrée). Appelle /api/search (qui
 * met en cache côté serveur).
 */
export function useYoutubeSearch() {
  const query = ref('')
  const results = ref<SearchResult[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Playlists recommandées (chips) : liste gérée en DB, fallback fichier.
  const recommended = ref<RecommendedPlaylist[]>([])
  // Recommandations affichées tant qu'aucune recherche n'est lancée.
  const popular = ref<SearchResult[]>([])
  // Playlist curée actuellement prévisualisée (chip cliquée) : ses titres sont
  // dans `results`, et on retient son ID pour le bouton « tout importer ».
  const activePlaylistId = ref<string | null>(null)

  let seq = 0 // anti-course : on ignore les réponses périmées

  // Détecte un ID de playlist dans une URL collée (music/www youtube, ?list=…).
  const playlistId = computed(() => {
    const m = query.value.match(/[?&]list=([A-Za-z0-9_-]+)/)
    return m?.[1] ?? null
  })

  // Détecte un ID de VIDÉO dans une URL collée (watch?v=, youtu.be/, shorts, embed).
  // Ignoré si c'est une URL de playlist pure (priorité à l'import playlist).
  const videoId = computed(() => {
    if (playlistId.value && !/[?&]v=/.test(query.value)) return null
    const m = query.value.match(
      /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/
    )
    return m?.[1] ?? null
  })

  /** Lance la recherche (sur Entrée) : lien vidéo → videos.list (1 unité),
   *  sinon recherche mots-clés. Ignorée si playlist pure ou trop court. */
  async function submit() {
    const trimmed = query.value.trim()
    if (videoId.value) {
      const mine = ++seq
      loading.value = true
      error.value = null
      try {
        const data = await $fetch<SearchResult[]>('/api/video', { query: { id: videoId.value } })
        if (mine === seq) results.value = data
      } catch {
        if (mine === seq) {
          error.value = 'Vidéo indisponible'
          results.value = []
        }
      } finally {
        if (mine === seq) loading.value = false
      }
      return
    }
    if (playlistId.value || trimmed.length < 2) return
    const mine = ++seq
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<SearchResult[]>('/api/search', { query: { q: trimmed } })
      if (mine === seq) results.value = data
    } catch {
      if (mine === seq) {
        error.value = 'Recherche indisponible'
        results.value = []
      }
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  /** Charge la liste des playlists recommandées (chips) depuis la DB.
   *  Repli sur le fichier recommendedPlaylists.ts si la table est vide/KO. */
  async function loadRecommended() {
    if (recommended.value.length) return // déjà chargées
    const fallback = RECOMMENDED_PLAYLISTS.filter(p => p.id)
    try {
      const data = await $fetch<RecommendedPlaylist[]>('/api/recommended')
      recommended.value = data.length ? data : fallback
    } catch {
      recommended.value = fallback
    }
  }

  /** Charge les recommandations « morceaux populaires » (0 unité de quota). */
  async function loadPopular() {
    if (popular.value.length) return // déjà chargées
    try {
      popular.value = await $fetch<SearchResult[]>('/api/popular')
    } catch {
      popular.value = []
    }
  }

  /** Prévisualise une playlist curée : charge ses titres dans `results`. */
  async function loadPlaylist(id: string) {
    if (!id || loading.value) return
    const mine = ++seq
    loading.value = true
    error.value = null
    activePlaylistId.value = id
    try {
      const data = await $fetch<SearchResult[]>('/api/playlist', { query: { id } })
      // /api/playlist renvoie { videoId, title, channel, thumbnail } → même forme.
      if (mine === seq) results.value = data
    } catch {
      if (mine === seq) {
        error.value = 'Playlist indisponible'
        results.value = []
        activePlaylistId.value = null
      }
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  // ID de playlist importable : soit collé dans l'input, soit chip prévisualisée.
  const importablePlaylistId = computed(() => playlistId.value ?? activePlaylistId.value)

  // Vider les résultats dès que l'input change (ils ne correspondent plus).
  // On quitte aussi l'aperçu de playlist curée éventuel.
  watch(query, () => {
    results.value = []
    activePlaylistId.value = null
  })

  function clear() {
    query.value = ''
    results.value = []
    error.value = null
    activePlaylistId.value = null
  }

  return {
    query, results, loading, error, clear, playlistId, submit,
    popular, loadPopular, loadPlaylist, activePlaylistId, importablePlaylistId,
    recommended, loadRecommended
  }
}
