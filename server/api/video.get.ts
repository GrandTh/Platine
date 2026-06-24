/**
 * Résolution d'une vidéo YouTube par son ID — proxy serveur.
 *
 * Le front appelle /api/video?id=VIDEO_ID quand l'utilisateur colle un lien
 * de vidéo. Quota : videos.list coûte 1 unité (vs 100 pour search.list) →
 * bien plus économe que de chercher l'URL en texte.
 *
 * Protégé par le même garde-fou que la recherche (rate limit IP + membre
 * actif d'une room) : 1 unité, mais un bot pourrait quand même marteler.
 */
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'
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
  contentDetails?: { duration?: string }
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
  const q = getQuery(event)
  const id = (q.id as string | undefined)?.trim()
  const uid = (q.uid as string | undefined)?.trim()
  const roomId = (q.roomId as string | undefined)?.trim()

  if (!youtubeApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'YOUTUBE_API_KEY manquante côté serveur' })
  }
  if (!id) return []

  const supabase = await serverSupabaseClient<Database>(event)
  await guardYoutubeRequest(event, supabase, 'video', uid, roomId)

  try {
    const data = await $fetch<YtVideoResponse>('https://www.googleapis.com/youtube/v3/videos', {
      query: {
        key: youtubeApiKey,
        part: 'snippet,contentDetails', // contentDetails = durée, gratuit (même appel)
        id
      }
    })

    return (data.items ?? [])
      .filter((it): it is YtVideoItem & { id: string } => !!it.id)
      .map(it => ({
        videoId: it.id,
        title: decodeHtml(it.snippet?.title ?? 'Sans titre'),
        channel: stripTopic(decodeHtml(it.snippet?.channelTitle ?? '')),
        thumbnail:
          it.snippet?.thumbnails?.medium?.url
          ?? it.snippet?.thumbnails?.default?.url
          ?? '',
        duration: parseIsoDuration(it.contentDetails?.duration)
      }))
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Vidéo YouTube indisponible' })
  }
})
