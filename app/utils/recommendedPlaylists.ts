/**
 * Playlists recommandées affichées dans l'onglet recherche tant que
 * l'utilisateur n'a rien cherché. Cliquer une chip charge ses titres dans la
 * liste de résultats (aperçu), où l'on peut ajouter à l'unité ou tout importer.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  COMMENT REMPLIR `id` :
 *  Ouvre la playlist YouTube voulue, copie la valeur du paramètre `list=` de
 *  l'URL. Ex. https://www.youtube.com/playlist?list=PLxxxxxxxx → id = "PLxxxxxxxx".
 *  Seules les playlists PUBLIQUES (ou non répertoriées) fonctionnent, et les
 *  vidéos doivent être lisibles en intégration (embed) pour se jouer.
 *
 *  Les entrées avec un `id` vide sont automatiquement masquées → tu peux en
 *  remplir une à une sans rien casser.
 * ───────────────────────────────────────────────────────────────────────────
 */
export interface RecommendedPlaylist {
  /** Libellé affiché sur la chip. */
  label: string
  /** ID de playlist YouTube (paramètre `list=`). Vide = chip masquée. */
  id: string
}

export const RECOMMENDED_PLAYLISTS: RecommendedPlaylist[] = [
  { label: 'Top 100 France', id: 'PL4fGSI1pDJn7bK3y1Hx-qpHBqfr6cesNs' },
  { label: 'Années 80', id: 'RDCLAK5uy_nWufZ3-rH924TsgmroKWiilEk-BQweReI' },
  { label: 'Pop', id: 'RDCLAK5uy_nmS3YoxSwVVQk9lEQJ0UX4ZCjXsW_psU8' },
  { label: 'Techno', id: 'RDCLAK5uy_n64_P7t3MmbTu7jziSk48DL' },
  { label: 'Rap', id: 'RDCLAK5uy_lBGRuQnsG37Akr1CY4SxL0VWFbPrbO4gs' }
]
