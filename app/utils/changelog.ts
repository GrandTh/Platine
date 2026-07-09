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
    version: '1.3.1',
    date: '2026-07-09',
    fixes: true
  },
  {
    version: '1.3.0',
    date: '2026-07-02',
    features: [
      {
        fr: 'Vous pouvez désormais soutenir Platine avec un petit café ☕ — un lien depuis l\'accueil, pour aider à garder l\'app gratuite et sans pub.',
        en: 'You can now support Platine with a small coffee ☕ — a link from the home page, to help keep the app free and ad-free.'
      }
    ],
    fixes: true
  },
  {
    version: '1.2.2',
    date: '2026-06-30',
    features: [
      {
        fr: 'Mise en conformité du lecteur vidéo avec les règles de YouTube.',
        en: 'Updated the video player to comply with YouTube\'s policies.'
      }
    ]
  },
  {
    version: '1.2.1',
    date: '2026-06-27',
    features: [
      {
        fr: 'Amélioration de l\'utilisation de la barre de réactions.',
        en: 'Improved reaction bar experience.'
      },
      {
        fr: 'Amélioration de la gestion des droits.',
        en: 'Improved permissions management.'
      }
    ]
  },
  {
    version: '1.2.0',
    date: '2026-06-26',
    features: [
      {
        fr: 'L\'hôte peut désormais retirer à un participant le droit d\'ajouter des morceaux (et le lui rendre à tout moment), pour garder la main sur la file.',
        en: 'The host can now revoke a participant\'s right to add tracks (and restore it anytime), to keep control over the queue.'
      }
    ],
    fixes: true
  },
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
