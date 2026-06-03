/**
 * Résolution d'une vidéo YouTube par son ID — proxy serveur.
 *
 * Le front appelle /api/video?id=VIDEO_ID quand l'utilisateur colle un lien
 * de vidéo. Quota : videos.list coûte 1 unité (vs 100 pour search.list) →
 * bien plus économe que de chercher l'URL en texte.
 */
import type { SearchResult } from '~~/server/api/search.get'

interface YtVideoItem {
  id?: string
  snippet?: {
    title?: string
    channelTitle?: string
    thumbnails?: {
      medium?: { url?: string }
      default?: { url?: string }
    }
  }
}

interface YtVideoResponse {
  items?: YtVideoItem[]
}

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
  const id = (getQuery(event).id as string | undefined)?.trim()

  if (!youtubeApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'YOUTUBE_API_KEY manquante côté serveur' })
  }
  if (!id) return []

  try {
    const data = await $fetch<YtVideoResponse>('https://www.googleapis.com/youtube/v3/videos', {
      query: {
        key: youtubeApiKey,
        part: 'snippet',
        id
      }
    })

    return (data.items ?? [])
      .filter((it): it is YtVideoItem & { id: string } => !!it.id)
      .map(it => ({
        videoId: it.id,
        title: decodeHtml(it.snippet?.title ?? 'Sans titre'),
        channel: decodeHtml(it.snippet?.channelTitle ?? ''),
        thumbnail:
          it.snippet?.thumbnails?.medium?.url
          ?? it.snippet?.thumbnails?.default?.url
          ?? ''
      }))
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Vidéo YouTube indisponible' })
  }
})
