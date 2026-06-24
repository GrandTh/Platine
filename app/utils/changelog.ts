/**
 * Changelog de Platine — SOURCE DE VÉRITÉ UNIQUE de la version de l'app.
 *
 * À CHAQUE LIVRAISON : ajouter une entrée EN HAUT du tableau (la plus récente
 * en premier). `APP_VERSION` en découle automatiquement (= 1ʳᵉ entrée), et c'est
 * elle qui :
 *   - s'affiche dans le footer de la home (« v1.2.0 ») ;
 *   - déclenche la modale « Nouveautés » (comparée à la dernière vue, stockée
 *     dans localStorage) — cf. WhatsNewModal + index.vue.
 *
 * Pas besoin de tag git / config Vercel : la version vit ici, embarquée au build.
 * (Garder `package.json` "version" synchro est optionnel, pour la propreté.)
 *
 * RÈGLE DE CONTENU :
 *   - `features` = NOUVEAUTÉS, détaillées, BILINGUES (`fr` requis, `en` repli FR).
 *   - `fixes: true` = il y a eu des corrections de bugs / sécurité / perf. On
 *     n'en DÉTAILLE JAMAIS le contenu (surtout pas les failles de sécu) : une
 *     seule ligne générique est affichée. Ne mets donc aucun détail de fix ici.
 */

export interface Feature {
  fr: string
  en?: string
}

export interface ChangelogEntry {
  version: string
  /** Date de livraison, format ISO yyyy-mm-dd. */
  date: string
  /** Nouveautés détaillées (optionnel). */
  features?: Feature[]
  /** true si la version contient des corrections (bugs/sécu/perf) → ligne générique, sans détail. */
  fixes?: boolean
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-06-24',
    features: [
      {
        fr: 'Durée des morceaux affichée à côté de chaque titre, et temps total de la playlist en un coup d\'œil.',
        en: 'Track durations shown next to each title, plus the playlist\'s total time at a glance.'
      },
      {
        fr: 'Musique non-stop : quand la file se vide, Platine enchaîne automatiquement des morceaux populaires (activable par l\'hôte).',
        en: 'Non-stop music: when the queue runs dry, Platine automatically keeps playing popular tracks (toggled by the host).'
      },
      {
        fr: 'Tous les emojis disponibles pour vos réactions grâce à un nouveau sélecteur complet.',
        en: 'Every emoji at your fingertips for reactions, thanks to a new full picker.'
      }
    ],
    fixes: true
  },
  {
    version: '1.0.0',
    date: '2026-06-23',
    features: [
      {
        fr: 'Lancement de Platine 🎉 — le jukebox collaboratif : une room, un lien partagé, une file commune et l\'écoute ensemble en temps réel.',
        en: 'Platine launch 🎉 — the collaborative jukebox: one room, a shared link, a common queue and listening together in real time.'
      },
      {
        fr: 'Ajout de morceaux YouTube (recherche, lien collé ou import de playlist) et système de votes pour faire remonter les sons.',
        en: 'Add YouTube tracks (search, pasted link or playlist import) and a voting system to push tracks up the queue.'
      },
      {
        fr: 'Vote pour passer le morceau en cours, et réactions emoji en temps réel.',
        en: 'Vote to skip the current track, and real-time emoji reactions.'
      },
      {
        fr: 'Mode TV : un affichage d\'ambiance plein écran, idéal branché sur une télé.',
        en: 'TV mode: a full-screen ambient display, perfect on a television.'
      },
      {
        fr: 'Passation d\'hôte automatique : si l\'hôte part, un autre participant prend le relais après quelques minutes.',
        en: 'Automatic host handoff: if the host leaves, another participant takes over after a few minutes.'
      }
    ]
  }
]

/** Version courante de l'app (= entrée la plus récente du changelog). */
export const APP_VERSION = CHANGELOG[0]?.version ?? '1.0.0'
