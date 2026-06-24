/**
 * Helpers YouTube partagés (durées des vidéos).
 *
 * `videos.list?part=contentDetails` coûte 1 unité de quota pour JUSQU'À 50 IDs
 * → récupérer les durées d'une page de résultats coûte ~1 unité. Les durées
 * sont immuables → on les stocke (search_cache, tracks) pour ne pas re-payer.
 */

/**
 * Retire le suffixe « - Topic » des noms de chaîne auto-générées par YouTube
 * (ex. « Teddy Swims - Topic » → « Teddy Swims »).
 */
export function stripTopic(s: string): string {
  return s.replace(/\s*-\s*Topic\s*$/i, '').trim()
}

/** Parse une durée ISO 8601 (ex. "PT1H2M3S") en secondes. */
export function parseIsoDuration(iso?: string): number | undefined {
  if (!iso) return undefined
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

interface YtContentItem { id?: string, contentDetails?: { duration?: string } }
interface YtContentResponse { items?: YtContentItem[] }

/**
 * Récupère les durées (en secondes) d'une liste d'IDs vidéo, par lots de 50
 * (1 unité de quota par lot). Best-effort : renvoie une map partielle (ou vide)
 * sans jamais lever — une durée manquante n'est pas bloquante.
 */
export async function fetchDurations(apiKey: string, ids: string[]): Promise<Record<string, number>> {
  const map: Record<string, number> = {}
  const unique = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50)
    try {
      const data = await $fetch<YtContentResponse>('https://www.googleapis.com/youtube/v3/videos', {
        query: { key: apiKey, part: 'contentDetails', id: batch.join(','), maxResults: 50 }
      })
      for (const it of data.items ?? []) {
        const sec = parseIsoDuration(it.contentDetails?.duration)
        if (it.id && sec != null) map[it.id] = sec
      }
    } catch {
      // best-effort : durées manquantes tolérées
    }
  }
  return map
}
