/**
 * Identifiant anonyme stable par navigateur.
 * Les invités rejoignent sans compte : cet id sert à attribuer les ajouts
 * et à garantir un seul vote par personne et par morceau.
 */
export function useAnonId(): string {
  if (!import.meta.client) return 'server'
  const KEY = 'platine:uid'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}
