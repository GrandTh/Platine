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
          shuffle_seed: string | null
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
          shuffle_seed?: string | null
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
          shuffle_seed?: string | null
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
      search_cache: {
        Row: {
          q: string
          results: unknown
          created_at: string
        }
        Insert: {
          q: string
          results: unknown
          created_at?: string
        }
        Update: {
          q?: string
          results?: unknown
          created_at?: string
        }
        Relationships: []
      }
      members: {
        Row: {
          room_id: string
          uid: string
          name: string | null
          last_seen: string
          created_at: string
        }
        Insert: {
          room_id: string
          uid: string
          name?: string | null
          last_seen?: string
          created_at?: string
        }
        Update: {
          room_id?: string
          uid?: string
          name?: string | null
          last_seen?: string
          created_at?: string
        }
        Relationships: []
      }
      skip_votes: {
        Row: {
          room_id: string
          track_id: string
          voter_id: string
          created_at: string
        }
        Insert: {
          room_id: string
          track_id: string
          voter_id: string
          created_at?: string
        }
        Update: {
          room_id?: string
          track_id?: string
          voter_id?: string
          created_at?: string
        }
        Relationships: []
      }
      recommended_playlists: {
        Row: {
          playlist_id: string
          label: string
          position: number
          enabled: boolean
          created_at: string
        }
        Insert: {
          playlist_id: string
          label: string
          position?: number
          enabled?: boolean
          created_at?: string
        }
        Update: {
          playlist_id?: string
          label?: string
          position?: number
          enabled?: boolean
          created_at?: string
        }
        Relationships: []
      }
      playlist_cache: {
        Row: {
          playlist_id: string
          tracks: unknown
          cached_at: string
        }
        Insert: {
          playlist_id: string
          tracks: unknown
          cached_at?: string
        }
        Update: {
          playlist_id?: string
          tracks?: unknown
          cached_at?: string
        }
        Relationships: []
      }
      popular_tracks: {
        Row: {
          source: 'youtube' | 'spotify'
          external_id: string
          title: string
          artist: string
          cover: string
          add_count: number
          last_added_at: string
        }
        Insert: {
          source: 'youtube' | 'spotify'
          external_id: string
          title?: string
          artist?: string
          cover?: string
          add_count?: number
          last_added_at?: string
        }
        Update: {
          source?: 'youtube' | 'spotify'
          external_id?: string
          title?: string
          artist?: string
          cover?: string
          add_count?: number
          last_added_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      rl_hit: {
        Args: { p_bucket: string, p_ttl_seconds: number, p_limit: number }
        Returns: boolean
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
