/**
 * Aperçu de partage (Open Graph) pour les liens de room.
 *
 * Les pages /room/CODE sont rendues côté navigateur (ssr:false) → le HTML servi
 * est quasi vide, donc les robots des réseaux sociaux (Facebook, iMessage,
 * WhatsApp, Discord…), qui n'exécutent PAS de JavaScript, ne voient ni titre ni
 * image. On injecte donc les balises OG côté serveur, dans le HTML de ces liens.
 *
 * Image = branding Platine (la même que la home), volontairement SANS le code de
 * la room. N'affecte pas l'expérience utilisateur (juste le <head> du document).
 */
const SITE = 'https://platine.live'
const TITLE = 'Platine — Écoutez ensemble'
const DESCRIPTION = 'Créez une room privée, ajoutez vos sons dans une file partagée et écoutez ensemble.'
const IMAGE = `${SITE}/og.png`

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html, { event }) => {
    const path = event?.path || ''
    if (!path.startsWith('/room/')) return

    const esc = (s: string) => s.replace(/"/g, '&quot;')
    const url = `${SITE}${path.split('?')[0]}`

    html.head.push(
      `<meta property="og:title" content="${esc(TITLE)}">`,
      `<meta property="og:description" content="${esc(DESCRIPTION)}">`,
      `<meta property="og:image" content="${IMAGE}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:url" content="${url}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${esc(TITLE)}">`,
      `<meta name="twitter:description" content="${esc(DESCRIPTION)}">`,
      `<meta name="twitter:image" content="${IMAGE}">`
    )
  })
})
