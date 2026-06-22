/**
 * Quorum de votes pour passer le morceau en cours — logique pure, extraite de
 * useSkipVote pour être testable.
 *
 * 50 % de TOUTE la room (hôte inclus dans le total), arrondi au supérieur,
 * minimum 1. L'hôte compte dans le total mais ne vote pas (il a son skip manuel).
 * Ex. room de 3 (1 hôte + 2 invités) → ceil(3/2) = 2 votes requis.
 */
export function skipQuorum(memberCount: number): number {
  return Math.max(1, Math.ceil(memberCount / 2))
}
