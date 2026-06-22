/**
 * Tri de la file de lecture — logique pure, extraite de useQueue pour être
 * testable et partagée. Règles (identiques au comportement historique) :
 *  - plus de votes d'abord ;
 *  - à égalité de votes : si shuffle actif ET 0 vote → ordre pseudo-aléatoire
 *    déterministe (même seed → même ordre pour tous les clients) ;
 *  - sinon → le plus ancien d'abord (FIFO).
 * Les morceaux votés gardent toujours la priorité sur les 0-vote.
 */
import type { QueueTrack } from '~/composables/useQueue'

/**
 * Rang pseudo-aléatoire déterministe (FNV-1a) à partir d'un id + seed partagé.
 * Même (id, seed) → même valeur partout → tous les clients trient pareil.
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

/** Trie une copie de la file selon les règles ci-dessus. N'altère pas l'entrée. */
export function sortQueue(tracks: QueueTrack[], seed: string | null): QueueTrack[] {
  return [...tracks].sort((a, b) => {
    if (b.voters.length !== a.voters.length) return b.voters.length - a.voters.length
    if (seed && a.voters.length === 0) {
      return seededRank(a.id, seed) - seededRank(b.id, seed)
    }
    return a.createdAt - b.createdAt
  })
}
