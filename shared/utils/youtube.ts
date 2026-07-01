/**
 * Helpers YouTube PARTAGÉS client ↔ serveur (auto-importés dans `app/` et
 * `server/` par Nuxt).
 */

/**
 * Retire le suffixe « - Topic » des noms de chaîne auto-générées par YouTube
 * (ex. « Teddy Swims - Topic » → « Teddy Swims »). Appliqué côté serveur à
 * l'ingestion et côté client sur les données déjà stockées.
 */
export function stripTopic(s: string): string {
  return s.replace(/\s*-\s*Topic\s*$/i, '').trim()
}
