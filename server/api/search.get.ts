/**
 * Recherche YouTube — proxy serveur, avec cache.
 *
 * La clé YouTube Data API reste côté serveur (runtimeConfig.youtubeApiKey)
 * et n'est jamais exposée au navigateur. Le front appelle /api/search?q=...
 *
 * ⚠️ Quota : search.list coûte 100 unités (quota gratuit = 10 000/jour).
 * Pour économiser, on met en cache les résultats par requête normalisée
 * (table search_cache) : une recherche déjà faite est resservie sans appeler
 * YouTube (0 unité).
 */
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

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
  const raw = (getQuery(event).q as string | undefined)?.trim()

  if (!youtubeApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'YOUTUBE_API_KEY manquante côté serveur' })
  }
  if (!raw) return []

  // Clé de cache normalisée (insensible à la casse / aux espaces).
  const cacheKey = raw.toLowerCase().replace(/\s+/g, ' ')
  const supabase = await serverSupabaseClient<Database>(event)

  // 1) Cache : si la requête a déjà été faite récemment, on ressert sans
  // toucher au quota. TTL de 30 jours → au-delà, on refait une vraie recherche
  // (les résultats musicaux sont stables, mais on évite de figer indéfiniment).
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
  const { data: cached } = await supabase
    .from('search_cache')
    .select('results, created_at')
    .eq('q', cacheKey)
    .maybeSingle()
  if (cached?.results && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
    return cached.results as SearchResult[]
  }

  // 2) Sinon, appel YouTube (100 unités) puis mise en cache.
  try {
    const data = await $fetch<YtSearchResponse>('https://www.googleapis.com/youtube/v3/search', {
      query: {
        key: youtubeApiKey,
        part: 'snippet',
        type: 'video',
        maxResults: 8,
        videoCategoryId: '10', // Musique
        q: raw
      }
    })

    const results: SearchResult[] = (data.items ?? [])
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

    // Mise en cache (upsert) : rafraîchit aussi created_at pour réarmer le TTL
    // quand on recache une entrée expirée.
    if (results.length) {
      await supabase.from('search_cache').upsert({
        q: cacheKey,
        results,
        created_at: new Date().toISOString()
      })
    }
    return results
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Recherche YouTube indisponible' })
  }
})
