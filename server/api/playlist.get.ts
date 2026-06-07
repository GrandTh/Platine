/**
 * Import de playlist YouTube — proxy serveur.
 *
 * Le front appelle /api/playlist?id=PLxxxx ; on renvoie jusqu'à MAX_ITEMS
 * morceaux en paginant (nextPageToken).
 *
 * Quota : playlistItems.list coûte 1 unité par page de 50 (vs 100 pour une
 * recherche) → quasi gratuit (200 titres = 4 unités). On plafonne à MAX_ITEMS
 * pour ne pas déverser une playlist géante dans la file.
 * Seules les playlists publiques / non répertoriées sont accessibles.
 */

// Plafond d'import (ajustable). 200 = jusqu'à 4 appels API.
const MAX_ITEMS = 200

interface YtPlaylistItem {
  snippet?: {
    title?: string
    videoOwnerChannelTitle?: string
    thumbnails?: {
      medium?: { url?: string }
      default?: { url?: string }
    }
    resourceId?: { videoId?: string }
  }
}

interface YtPlaylistResponse {
  items?: YtPlaylistItem[]
  nextPageToken?: string
}

export interface PlaylistTrack {
  videoId: string
  title: string
  channel: string
  thumbnail: string
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export default defineEventHandler(async (event): Promise<PlaylistTrack[]> => {
  const { youtubeApiKey } = useRuntimeConfig(event)
  const id = (getQuery(event).id as string | undefined)?.trim()

  if (!youtubeApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'YOUTUBE_API_KEY manquante côté serveur' })
  }
  if (!id) return []

  try {
    const out: PlaylistTrack[] = []
    let pageToken: string | undefined

    // Pagination : 50 items/page jusqu'à MAX_ITEMS (ou fin de la playlist).
    do {
      const data = await $fetch<YtPlaylistResponse>('https://www.googleapis.com/youtube/v3/playlistItems', {
        query: {
          key: youtubeApiKey,
          part: 'snippet',
          maxResults: 50,
          playlistId: id,
          ...(pageToken ? { pageToken } : {})
        }
      })

      for (const it of data.items ?? []) {
        const videoId = it.snippet?.resourceId?.videoId
        // Ignore les vidéos supprimées/privées.
        if (!videoId || it.snippet?.title === 'Deleted video' || it.snippet?.title === 'Private video') continue
        out.push({
          videoId,
          title: decodeHtml(it.snippet?.title ?? 'Sans titre'),
          channel: decodeHtml(it.snippet?.videoOwnerChannelTitle ?? ''),
          thumbnail:
            it.snippet?.thumbnails?.medium?.url
            ?? it.snippet?.thumbnails?.default?.url
            ?? ''
        })
        if (out.length >= MAX_ITEMS) break
      }

      pageToken = data.nextPageToken
    } while (pageToken && out.length < MAX_ITEMS)

    return out
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Import de playlist indisponible' })
  }
})
