import { defineVitestConfig } from '@nuxt/test-utils/config'

// Tests unitaires (env node par défaut) + tests de composants Nuxt (chaque
// fichier concerné déclare `// @vitest-environment nuxt` en tête).
// Les tests e2e ont leur propre config (vitest.e2e.config.ts) car ils
// démarrent le serveur + un navigateur (lourd, lancé séparément).
export default defineVitestConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.{test,spec}.ts', 'test/nuxt/**/*.{test,spec}.ts'],
    environmentOptions: {
      nuxt: { domEnvironment: 'happy-dom' }
    }
  }
})
