/**
 * Import de playlist YouTube — proxy serveur.
 *
 * Le front appelle /api/playlist?id=PLxxxx ; on renvoie jusqu'à MAX_ITEMS
 * morceaux en paginant (nextPageToken).
 *
 * Quota : playlistItems.list coûte 1 unité par page de 50 (vs 100 pour une
 * recherche) → quasi gratuit (100 titres = 2 unités). On plafonne à MAX_ITEMS
 * pour ne pas déverser une playlist géante dans la file (la room est elle-même
 * plafonnée à 200 morceaux, cf. useQueue → ROOM_CAP).
 * Seules les playlists publiques / non répertoriées sont accessibles.
 *
 * Cache (table playlist_cache) : le 1er fetch d'une playlist est mémorisé ;
 * les visites suivantes sont resservies depuis la DB sans toucher au quota
 * (TTL 24 h). Un cron pg_cron optionnel vide la table chaque nuit.
 */
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

// Plafond d'import par playlist (ajustable). 100 = jusqu'à 2 appels API.
const MAX_ITEMS = 100

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

// Au-delà de ce délai, on refait une vraie récupération (puis on recache).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export default defineEventHandler(async (event): Promise<PlaylistTrack[]> => {
  const { youtubeApiKey } = useRuntimeConfig(event)
  const q = getQuery(event)
  const id = (q.id as string | undefined)?.trim()
  const uid = (q.uid as string | undefined)?.trim()
  const roomId = (q.roomId as string | undefined)?.trim()

  if (!id) return []

  const supabase = await serverSupabaseClient<Database>(event)

  // Anti-abus (rate limit IP + membre actif), avant cache et appel YouTube.
  await guardYoutubeRequest(event, supabase, 'playlist', uid, roomId)

  // 1) Cache : si la playlist a été récupérée il y a moins de 24 h, on la
  // ressert depuis la DB → 0 unité de quota, pas d'appel YouTube.
  const { data: cached } = await supabase
    .from('playlist_cache')
    .select('tracks, cached_at')
    .eq('playlist_id', id)
    .maybeSingle()
  if (cached?.tracks && Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL_MS) {
    return cached.tracks as PlaylistTrack[]
  }

  // 2) Sinon, on récupère depuis YouTube (clé requise ici seulement).
  if (!youtubeApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'YOUTUBE_API_KEY manquante côté serveur' })
  }

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

    // 3) Mise en cache (upsert) : réarme cached_at pour repartir sur 24 h.
    if (out.length) {
      await supabase.from('playlist_cache').upsert({
        playlist_id: id,
        tracks: out,
        cached_at: new Date().toISOString()
      })
    }
    return out
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Import de playlist indisponible' })
  }
})
