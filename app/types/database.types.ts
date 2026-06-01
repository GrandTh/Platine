// Types de la base Supabase (schéma public).
// Reflète supabase/schema.sql — à garder synchronisé si le schéma évolue.

export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string
          host_id: string
          source: 'youtube' | 'both'
          mode: 'speaker' | 'each'
          playing: boolean
          current_track_id: string | null
          last_active: string
          created_at: string
        }
        Insert: {
          id: string
          host_id: string
          source?: 'youtube' | 'both'
          mode?: 'speaker' | 'each'
          playing?: boolean
          current_track_id?: string | null
          last_active?: string
          created_at?: string
        }
        Update: {
          id?: string
          host_id?: string
          source?: 'youtube' | 'both'
          mode?: 'speaker' | 'each'
          playing?: boolean
          current_track_id?: string | null
          last_active?: string
          created_at?: string
        }
        Relationships: []
      }
      tracks: {
        Row: {
          id: string
          room_id: string
          title: string
          artist: string
          cover: string
          source: 'youtube' | 'spotify'
          external_id: string
          added_by: string
          played: boolean
          created_at: string
        }
        Insert: {
          id?: string
          room_id: string
          title: string
          artist?: string
          cover?: string
          source: 'youtube' | 'spotify'
          external_id: string
          added_by: string
          played?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          room_id?: string
          title?: string
          artist?: string
          cover?: string
          source?: 'youtube' | 'spotify'
          external_id?: string
          added_by?: string
          played?: boolean
          created_at?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          track_id: string
          voter_id: string
          created_at: string
        }
        Insert: {
          track_id: string
          voter_id: string
          created_at?: string
        }
        Update: {
          track_id?: string
          voter_id?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
