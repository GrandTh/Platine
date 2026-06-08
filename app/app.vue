<script setup>
const { t, locale } = useI18n()
const route = useRoute()
const ogImage = 'https://platine.live/og.png'

// URL canonique de la page courante (sans slash final pour la racine).
const canonical = computed(() => `https://platine.live${route.path === '/' ? '' : route.path}`)

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', type: 'image/png', href: '/vinyl.png' },
    // Canonical : indique à Google l'URL officielle de chaque page.
    { rel: 'canonical', href: () => canonical.value }
  ],
  // Données structurées : aide Google à identifier la marque « Platine ».
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        'name': 'Platine',
        'url': 'https://platine.live'
      })
    }
  ],
  htmlAttrs: {
    // se met à jour avec la langue choisie
    lang: () => locale.value
  }
})

// Getters → les meta se mettent à jour au changement de langue.
useSeoMeta({
  title: () => t('meta.title'),
  description: () => t('meta.description'),
  ogTitle: () => t('meta.title'),
  ogDescription: () => t('meta.description'),
  ogImage,
  ogType: 'website',
  ogUrl: 'https://platine.live',
  twitterCard: 'summary_large_image',
  twitterImage: ogImage
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
