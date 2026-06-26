// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@tresjs/nuxt',
    '@nuxtjs/supabase',
    '@nuxtjs/i18n',
    // Vercel Web Analytics + Speed Insights (actifs en prod sur Vercel ;
    // no-op en local). À activer aussi dans le dashboard Vercel.
    '@vercel/analytics/nuxt',
    '@vercel/speed-insights/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // Secrets côté serveur uniquement (jamais exposés au navigateur).
  runtimeConfig: {
    // Clé YouTube — via NUXT_YOUTUBE_API_KEY ou YOUTUBE_API_KEY dans .env.
    youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
    // Allowlist des emails admin (séparés par des virgules) autorisés sur /admin.
    // Vérifiée côté serveur dans requireAdmin (en plus de la session + 2FA aal2).
    adminEmails: process.env.ADMIN_EMAILS ?? ''
  },

  routeRules: {
    '/': { prerender: true },
    // Pages WebGL : rendu client uniquement (Three.js a besoin du DOM/canvas)
    '/now-playing': { ssr: false },
    '/room/**': { ssr: false }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Internationalisation : FR (défaut) + EN. Langue détectée puis mémorisée
  // dans un cookie. Pas de préfixe d'URL (/fr, /en) → URLs inchangées.
  i18n: {
    locales: [
      { code: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'en', name: 'English', file: 'en.json' }
    ],
    defaultLocale: 'fr',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'platine_lang',
      redirectOn: 'root'
    }
  },

  // Invités anonymes : pas de page de login ni de redirection d'auth.
  supabase: {
    redirect: false
  }
})
