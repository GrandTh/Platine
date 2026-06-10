/**
 * Playlists recommandées (chips de l'onglet recherche).
 *
 * Renvoie la liste depuis la table `recommended_playlists` (gérée via le Table
 * Editor de Supabase) : libellé + ID de playlist, triés par `position`.
 * Aucun appel YouTube → 0 unité de quota.
 *
 * Le front se rabat sur app/utils/recommendedPlaylists.ts si la table est vide.
 */
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'
import type { RecommendedPlaylist } from '~/utils/recommendedPlaylists'

export default defineEventHandler(async (event): Promise<RecommendedPlaylist[]> => {
  const supabase = await serverSupabaseClient<Database>(event)

  const { data } = await supabase
    .from('recommended_playlists')
    .select('label, playlist_id, position')
    .eq('enabled', true)
    .order('position', { ascending: true })
    .order('label', { ascending: true })

  return (data ?? []).map(r => ({ label: r.label, id: r.playlist_id }))
})
