/**
 * Import de playlist YouTube — proxy serveur.
 *
 * Le front appelle /api/playlist?id=PLxxxx ; on renvoie jusqu'à 50 morceaux.
 *
 * Quota : playlistItems.list coûte 1 unité par page (vs 100 pour une
 * recherche) → quasi gratuit. On plafonne à 50 (une seule page).
 * Seules les playlists publiques / non répertoriées sont accessibles.
 */

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
    const data = await $fetch<YtPlaylistResponse>('https://www.googleapis.com/youtube/v3/playlistItems', {
      query: {
        key: youtubeApiKey,
        part: 'snippet',
        maxResults: 50,
        playlistId: id
      }
    })

    return (data.items ?? [])
      .filter((it): it is YtPlaylistItem & { snippet: { resourceId: { videoId: string } } } =>
        !!it.snippet?.resourceId?.videoId
        // Vidéos supprimées/privées → titre "Deleted video" / "Private video"
        && it.snippet.title !== 'Deleted video'
        && it.snippet.title !== 'Private video')
      .map(it => ({
        videoId: it.snippet.resourceId.videoId,
        title: decodeHtml(it.snippet.title ?? 'Sans titre'),
        channel: decodeHtml(it.snippet.videoOwnerChannelTitle ?? ''),
        thumbnail:
          it.snippet.thumbnails?.medium?.url
          ?? it.snippet.thumbnails?.default?.url
          ?? ''
      }))
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Import de playlist indisponible' })
  }
})
