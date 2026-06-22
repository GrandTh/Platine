import { defineConfig } from 'vitest/config'

// Tests end-to-end : @nuxt/test-utils démarre l'app (build + serveur) et un
// navigateur Playwright. Lourd → lancé via `pnpm test:e2e`, séparé des unitaires.
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.{test,spec}.ts'],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    // Un seul worker, fichiers en série : le build Nuxt + le navigateur sont
    // lourds en mémoire (Vitest 4 : poolOptions remplacé par ces options).
    pool: 'forks',
    fileParallelism: false
  }
})
