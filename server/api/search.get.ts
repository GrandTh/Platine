/**
 * Recherche YouTube — proxy serveur.
 *
 * La clé YouTube Data API reste côté serveur (runtimeConfig.youtubeApiKey)
 * et n'est jamais exposée au navigateur. Le front appelle /api/search?q=...
 *
 * ⚠️ Quota : une recherche coûte 100 unités (quota gratuit = 10 000/jour,
 * soit ~100 recherches). Le front doit débouncer et éviter les requêtes
 * inutiles.
 */

interface YtSearchItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    channelTitle?: string
    thumbnails?: {
      medium?: { url?: string }
      default?: { url?: string }
    }
  }
}

interface YtSearchResponse {
  items?: YtSearchItem[]
}

export interface SearchResult {
  videoId: string
  title: string
  channel: string
  thumbnail: string
}

// Décode les entités HTML que YouTube renvoie dans les titres (&amp; &#39; …)
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export default defineEventHandler(async (event): Promise<SearchResult[]> => {
  const { youtubeApiKey } = useRuntimeConfig(event)
  const q = (getQuery(event).q as string | undefined)?.trim()

  if (!youtubeApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'YOUTUBE_API_KEY manquante côté serveur' })
  }
  if (!q) return []

  try {
    const data = await $fetch<YtSearchResponse>('https://www.googleapis.com/youtube/v3/search', {
      query: {
        key: youtubeApiKey,
        part: 'snippet',
        type: 'video',
        maxResults: 8,
        videoCategoryId: '10', // Musique
        q
      }
    })

    return (data.items ?? [])
      .filter((it): it is YtSearchItem & { id: { videoId: string } } => !!it.id?.videoId)
      .map(it => ({
        videoId: it.id.videoId,
        title: decodeHtml(it.snippet?.title ?? 'Sans titre'),
        channel: decodeHtml(it.snippet?.channelTitle ?? ''),
        thumbnail:
          it.snippet?.thumbnails?.medium?.url
          ?? it.snippet?.thumbnails?.default?.url
          ?? ''
      }))
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Recherche YouTube indisponible' })
  }
})
