/**
 * Couleur déterministe à partir d'un identifiant anonyme.
 * Pas de stockage : la même uid donne toujours la même couleur, donc la
 * bordure d'un morceau reste cohérente même si l'auteur a quitté la room.
 */
// Palette partagée (membres par rang d'arrivée, et repli par hash).
export const COLOR_PALETTE = [
  '#f43f5e', // rose
  '#fb923c', // orange
  '#facc15', // jaune
  '#4ade80', // vert
  '#2dd4bf', // teal
  '#38bdf8', // bleu clair
  '#818cf8', // indigo
  '#c084fc', // violet
  '#f472b6', // fuchsia
  '#a3e635' // lime
]

export function userColor(uid: string): string {
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) | 0
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]!
}

/** Nom de repli lisible quand le membre n'a pas choisi de pseudo. */
export function shortId(uid: string): string {
  return `User-${uid.slice(0, 4).toUpperCase()}`
}
