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

// Fenêtre de présence : un membre est "actif" si vu il y a moins de 90 s
// (heartbeat = 20 s côté client, on garde de la marge).
const MEMBER_WINDOW_MS = 90_000

export default defineEventHandler(async (event): Promise<SearchResult[]> => {
  const { youtubeApiKey } = useRuntimeConfig(event)
  const q = getQuery(event)
  const raw = (q.q as string | undefined)?.trim()
  const uid = (q.uid as string | undefined)?.trim()
  const roomId = (q.roomId as string | undefined)?.trim()

  if (!youtubeApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'YOUTUBE_API_KEY manquante côté serveur' })
  }
  // Min 2 caractères (déjà filtré côté client, re-vérifié ici).
  if (!raw || raw.length < 2) return []

  const supabase = await serverSupabaseClient<Database>(event)

  // --- Anti-abus (avant tout appel YouTube) ---

  // 1) Rate limit par IP : un humain n'atteint jamais ces seuils, un bot oui.
  // Fenêtre courte (anti-rafale) + fenêtre large (anti-spam soutenu).
  // En cas d'erreur RPC (ex. migration pas encore jouée), on laisse passer
  // (fail-open) pour ne pas casser la recherche.
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  for (const [tag, ttl, limit] of [['s10', 10, 8], ['s5m', 300, 40]] as const) {
    const { data: allowed } = await supabase.rpc('rl_hit', {
      p_bucket: `search:${tag}:${ip}`,
      p_ttl_seconds: ttl,
      p_limit: limit
    })
    if (allowed === false) {
      throw createError({ statusCode: 429, statusMessage: 'Trop de recherches, réessaie dans un instant' })
    }
  }

  // 2) Recherche réservée aux membres actifs d'une room : oblige à être dans
  // une vraie room (uid + room présents en base), pas juste à taper l'URL.
  if (!uid || !roomId) {
    throw createError({ statusCode: 403, statusMessage: 'Rejoins une room pour rechercher' })
  }
  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('uid')
    .eq('room_id', roomId)
    .eq('uid', uid)
    .gt('last_seen', new Date(Date.now() - MEMBER_WINDOW_MS).toISOString())
    .maybeSingle()
  // memberErr = souci DB → fail-open (le rate limit protège déjà) ; sinon, pas
  // de ligne = pas un membre actif → refus.
  if (!memberErr && !member) {
    throw createError({ statusCode: 403, statusMessage: 'Rejoins une room pour rechercher' })
  }

  // Clé de cache normalisée (insensible à la casse / aux espaces).
  const cacheKey = raw.toLowerCase().replace(/\s+/g, ' ')

  // 1) Cache : si la requête a déjà été faite récemment, on ressert sans
  // toucher au quota. TTL de 12 h → au-delà, on refait une vraie recherche.
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000
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
        maxResults: 25,
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
