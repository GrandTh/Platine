/**
 * Helpers de file PARTAGÉS client ↔ serveur (auto-importés dans `app/` et
 * `server/` par Nuxt). Le tri de la file est reproduit à deux endroits (client
 * `useQueue` pour l'affichage, serveur `admin/room/skip` pour le skip admin) :
 * ces briques DOIVENT être identiques des deux côtés, d'où la source unique ici.
 */

/**
 * Rang pseudo-aléatoire déterministe (FNV-1a) à partir d'un id + graine partagée.
 * Même graine → même ordre pour tous les clients ET côté serveur. Utilisé pour
 * mélanger les morceaux à 0 vote de façon reproductible.
 */
export function seededRank(id: string, seed: string): number {
  let h = 2166136261
  const s = id + seed
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
