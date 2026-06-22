# Tests

## Lancer

```bash
pnpm test          # unitaires + composants (rapide, aucun service externe)
pnpm test:watch    # idem en mode watch
pnpm test:e2e      # end-to-end (build + navigateur + Supabase local)
```

## Organisation

| Dossier        | Type            | Environnement        | Dépendances |
|----------------|-----------------|----------------------|-------------|
| `test/unit`    | Unitaires (logique pure) | node          | aucune |
| `test/nuxt`    | Composants Vue  | nuxt (`// @vitest-environment nuxt`) | aucune |
| `test/e2e`     | End-to-end      | navigateur Playwright | build + `.env` (Supabase) |

## Couverture

**Unitaires** (`test/unit`)
- `queueSort` — tri de la file : priorité aux votes, FIFO à égalité, shuffle
  déterministe (même seed → même ordre pour tous les clients), immuabilité.
- `userColor` — couleur déterministe par uid, palette valide/sans doublon, `shortId`.
- `skipQuorum` — quorum de skip (50 % arrondi sup., minimum 1).
- `recommendedPlaylists` — intégrité des données (labels, ids).
- `youtubeGuard` — gardes serveur anti-abus : `requireActiveMember` (403 si non
  membre / champs manquants, fail-open sur erreur DB) et `rateLimitByIp`
  (429 au dépassement, fail-open, une vérif par fenêtre).

**Composants** (`test/nuxt`)
- `TvMode` — titre/artiste, playlist en dégradé d'opacité (le prochain = le plus
  blanc), état « en attente », timeline conditionnelle, émission de `exit`.

**E2E** (`test/e2e`)
- Home : chargement, CTA Créer/Rejoindre, ouverture du choix de mode.
- `?tv` ouvre directement le mode TV **sans monter la 3D** (canvas absent).
- Une room existante (sans `?tv`) monte bien la scène 3D (canvas présent).

## Prérequis E2E

```bash
pnpm exec playwright-core install chromium   # navigateur (une fois)
npx supabase start                           # Supabase local (lu via .env)
```

Le build de prod est gourmand : `pnpm test:e2e` est lancé en un seul worker.
Sur machine chargée, augmenter la heap : `NODE_OPTIONS=--max-old-space-size=6144 pnpm test:e2e`.
