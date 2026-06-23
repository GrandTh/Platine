<script setup lang="ts">
const { t, locale } = useI18n()
const isFr = computed(() => locale.value === 'fr')

useSeoMeta({
  title: () => (isFr.value ? 'Nouveautés — Platine' : 'What\'s new — Platine'),
  robots: 'index, follow'
})
</script>

<template>
  <div class="min-h-dvh bg-[#070510] text-white">
    <div class="mx-auto max-w-2xl px-6 py-12 md:py-16">
      <NuxtLink
        to="/"
        class="mb-8 inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4"
        />
        {{ t('footer.back') }}
      </NuxtLink>

      <header class="mb-8">
        <h1 class="font-[Gyanko] text-3xl tracking-wide">
          {{ t('whatsNew.pageTitle') }}
        </h1>
        <p class="mt-2 text-sm text-white/45">
          {{ t('whatsNew.subtitle') }}
        </p>
      </header>

      <ChangelogList />
    </div>
  </div>
</template>
