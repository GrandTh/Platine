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

  return { query, results, loading, error, clear }
}
