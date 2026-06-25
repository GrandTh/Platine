<script setup lang="ts">
/**
 * Rendu du changelog, bilingue. Partagé par la modale « Nouveautés » et la page
 * /nouveautes. Source : utils/changelog.ts.
 *
 * Les NOUVEAUTÉS sont détaillées ; les corrections (bugs/sécu/perf) sont
 * regroupées en UNE ligne générique (`fixes: true`), jamais détaillées.
 */
import { CHANGELOG } from '~/utils/changelog'

/** `latestOnly` → n'affiche que la dernière version (modale « Nouveautés »).
 *  Par défaut : tout le changelog (page /nouveautes). */
const props = defineProps<{ latestOnly?: boolean }>()

const { t, locale } = useI18n()
const isFr = computed(() => locale.value === 'fr')
const entries = computed(() => props.latestOnly ? CHANGELOG.slice(0, 1) : CHANGELOG)

function txt(i: { fr: string, en?: string }) {
  return !isFr.value && i.en ? i.en : i.fr
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(isFr.value ? 'fr-FR' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
}
</script>

<template>
  <div class="space-y-8">
    <section
      v-for="entry in entries"
      :key="entry.version"
      class="space-y-3"
    >
      <div class="flex items-baseline gap-3">
        <h3 class="text-lg font-bold">
          v{{ entry.version }}
        </h3>
        <span class="text-xs text-white/40">{{ fmtDate(entry.date) }}</span>
      </div>
      <ul class="space-y-2.5">
        <!-- Nouveautés détaillées -->
        <li
          v-for="(f, i) in entry.features"
          :key="i"
          class="flex items-start gap-2.5"
        >
          <span class="mt-0.5 shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300 uppercase ring-1 ring-emerald-400/30">
            {{ t('whatsNew.featureLabel') }}
          </span>
          <span class="text-sm leading-relaxed text-white/75">{{ txt(f) }}</span>
        </li>
        <!-- Corrections regroupées (générique, sans détail) -->
        <li
          v-if="entry.fixes"
          class="flex items-start gap-2.5"
        >
          <span class="mt-0.5 shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sky-300 uppercase ring-1 ring-sky-400/30">
            {{ t('whatsNew.fixesLabel') }}
          </span>
          <span class="text-sm leading-relaxed text-white/75">{{ t('whatsNew.fixesLine') }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
