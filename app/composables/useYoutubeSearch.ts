import type { SearchResult } from '~~/server/api/search.get'

/**
 * Recherche YouTube côté client, débouncée.
 * Appelle la route serveur /api/search (la clé reste côté serveur).
 */
export function useYoutubeSearch(delay = 450) {
  const query = ref('')
  const results = ref<SearchResult[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let seq = 0 // anti-course : on ignore les réponses périmées

  // Détecte un ID de playlist dans une URL collée (music/www youtube, ?list=…).
  const playlistId = computed(() => {
    const m = query.value.match(/[?&]list=([A-Za-z0-9_-]+)/)
    return m?.[1] ?? null
  })

  async function run(q: string) {
    const mine = ++seq
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<SearchResult[]>('/api/search', { query: { q } })
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

  watch(query, (q) => {
    if (timer) clearTimeout(timer)
    const trimmed = q.trim()
    // URL de playlist collée → pas de recherche mots-clés (l'UI propose l'import).
    if (playlistId.value) {
      results.value = []
      loading.value = false
      return
    }
    if (trimmed.length < 2) {
      results.value = []
      loading.value = false
      return
    }
    timer = setTimeout(() => run(trimmed), delay)
  })

  function clear() {
    query.value = ''
    results.value = []
    error.value = null
  }

  return { query, results, loading, error, clear, playlistId }
}
