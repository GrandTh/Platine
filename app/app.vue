<script setup>
const { t, locale } = useI18n()
const ogImage = 'https://platine.live/og.png'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', type: 'image/png', href: '/vinyl.png' }
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
