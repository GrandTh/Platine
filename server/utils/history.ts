/**
 * Historique de playlist : copie des morceaux qui QUITTENT la file dans
 * `track_history`, avant leur suppression. Best-effort — ne casse JAMAIS la
 * suppression (si la table manque, migration pas encore jouée, etc.).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

export interface HistoryTrack {
  room_id: string
  title: string
  artist: string | null
  cover: string | null
  source: string
  external_id: string
  duration: number | null
  added_by: string | null
}

/** Champs à sélectionner sur `tracks` pour alimenter l'historique. */
export const HISTORY_SELECT = 'room_id, title, artist, cover, source, external_id, duration, added_by'

export async function recordHistory(
  supabase: SupabaseClient<Database>,
  rows: HistoryTrack[]
): Promise<void> {
  if (!rows.length) return
  try {
    await supabase.from('track_history').insert(rows.map(r => ({
      room_id: r.room_id,
      title: r.title,
      artist: r.artist ?? '',
      cover: r.cover ?? '',
      source: r.source,
      external_id: r.external_id,
      duration: r.duration,
      added_by: r.added_by
    })))
  } catch {
    // best-effort : l'historique ne doit jamais bloquer une suppression
  }
}
