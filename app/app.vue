<script setup>
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', type: 'image/png', href: '/vinyl.png' }
  ],
  htmlAttrs: {
    lang: 'fr'
  }
})

const title = 'Platine — Écoutez ensemble'
const description = 'Créez une room privée, ajoutez vos sons dans une file partagée et écoutez ensemble.'
// URL absolue requise pour les images OG (les plateformes ne lisent pas les chemins relatifs)
const ogImage = 'https://platine.live/og.png'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
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
