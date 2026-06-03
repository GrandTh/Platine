<script setup lang="ts">
// Bascule de langue FR / EN. La locale est mémorisée par le module i18n (cookie).
const { locale, setLocale } = useI18n()

const next = computed(() => (locale.value === 'fr' ? 'en' : 'fr'))
function toggle() {
  setLocale(next.value as 'fr' | 'en')
}
</script>

<template>
  <button
    class="pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/70 backdrop-blur-xl transition hover:bg-white/20"
    :aria-label="`Switch to ${next}`"
    @click="toggle"
  >
    <UIcon
      name="i-lucide-languages"
      class="size-4"
    />
    {{ locale }}
  </button>
</template>
