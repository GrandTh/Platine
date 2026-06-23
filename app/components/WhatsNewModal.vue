<script setup lang="ts">
/**
 * Modale « Nouveautés » : affichée à l'arrivée sur la home quand une nouvelle
 * version est dispo (logique de visibilité + localStorage gérés par index.vue).
 * Contient une case « ne plus afficher ». Le contenu = ChangelogList (partagé).
 */
import { APP_VERSION } from '~/utils/changelog'

const { t } = useI18n()
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [dontShowAgain: boolean] }>()

const dontShow = ref(false)
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    @click.self="emit('close', dontShow)"
  >
    <div class="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-3xl border border-white/15 bg-white/10 text-white shadow-2xl backdrop-blur-2xl">
      <!-- En-tête -->
      <div class="flex items-start justify-between gap-3 border-b border-white/10 p-5">
        <div>
          <h2 class="text-xl font-bold">
            {{ t('whatsNew.title') }}
          </h2>
          <p class="mt-0.5 text-sm text-white/55">
            {{ t('whatsNew.subtitle') }}
          </p>
        </div>
        <span class="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">v{{ APP_VERSION }}</span>
      </div>

      <!-- Contenu défilable -->
      <div class="min-h-0 flex-1 overflow-y-auto p-5">
        <ChangelogList />
      </div>

      <!-- Pied : ne plus afficher + fermer -->
      <div class="flex items-center justify-between gap-3 border-t border-white/10 p-4">
        <label class="flex cursor-pointer items-center gap-2 text-sm text-white/60 select-none">
          <input
            v-model="dontShow"
            type="checkbox"
            class="size-4 cursor-pointer accent-fuchsia-500"
          >
          {{ t('whatsNew.dontShow') }}
        </label>
        <button
          class="cursor-pointer rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          @click="emit('close', dontShow)"
        >
          {{ t('whatsNew.gotIt') }}
        </button>
      </div>
    </div>
  </div>
</template>
