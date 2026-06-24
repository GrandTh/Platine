/**
 * Morceaux populaires — recommandations.
 *
 * Renvoie le top des morceaux les plus ajoutés (toutes rooms confondues),
 * depuis la table persistante `popular_tracks` alimentée par un trigger DB.
 * Aucun appel YouTube → 0 unité de quota.
 *
 * On renvoie la même forme que /api/search (SearchResult) pour réutiliser
 * directement l'UI de résultats côté room.
 */
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'
import type { SearchResult } from '~~/server/api/search.get'

// Nombre de recommandations affichées (stockage illimité, affichage plafonné).
const LIMIT = 30

export default defineEventHandler(async (event): Promise<SearchResult[]> => {
  const supabase = await serverSupabaseClient<Database>(event)

  const { data } = await supabase
    .from('popular_tracks')
    .select('external_id, title, artist, cover, duration')
    .eq('source', 'youtube')
    .order('add_count', { ascending: false })
    .limit(LIMIT)

  return (data ?? []).map(r => ({
    videoId: r.external_id,
    title: r.title,
    channel: stripTopic(r.artist),
    thumbnail: r.cover,
    duration: r.duration ?? undefined
  }))
})
