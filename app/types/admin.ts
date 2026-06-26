// Types partagés des endpoints d'administration (/api/admin/*).
// Importés par les endpoints serveur ET les pages /admin (via ~/types/admin).

export interface AdminRoom {
  id: string
  hostId: string
  ownerId: string | null
  mode: string
  playing: boolean
  autoplay: boolean
  memberCount: number
  trackCount: number
  lastActive: string
  createdAt: string
}

export interface AdminMember {
  uid: string
  name: string | null
  muted: boolean
  lastSeen: string
  createdAt: string
}

export interface AdminTrack {
  id: string
  title: string
  artist: string
  cover: string
  source: string
  externalId: string
  duration: number | null
  addedBy: string
  votes: number
  createdAt: string
}

export interface AdminRoomDetail {
  id: string
  hostId: string
  ownerId: string | null
  mode: string
  playing: boolean
  autoplay: boolean
  currentTrackId: string | null
  lastActive: string
  createdAt: string
  members: AdminMember[]
  tracks: AdminTrack[]
}
