<script setup lang="ts">
import type { PerspectiveCamera } from 'three'

definePageMeta({ layout: false })

const { palette, extract, loading } = useAlbumPalette()

// État "morceau en cours"
const coverSrc = ref('/sample-cover.svg')
const title = ref('Liquid Dreams')
const artist = ref('Vibrant Collective')

// Re-extrait la palette à chaque changement de pochette.
watch(coverSrc, src => extract(src), { immediate: true })

// Couleurs dérivées (hex) pour piloter lumières + UI glassmorphism.
const hex = (key: keyof typeof palette.value) =>
  computed(() => `#${palette.value[key].getHexString()}`)

const vibrantHex = hex('vibrant')
const lightVibrantHex = hex('lightVibrant')
const darkVibrantHex = hex('darkVibrant')
const darkMutedHex = hex('darkMuted')

// Caméra orientée vers le vinyle.
const cameraRef = shallowRef<PerspectiveCamera | null>(null)
watch(cameraRef, (cam) => {
  cam?.lookAt(0, 0, 0)
})

// --- Contrôles UI ---
const urlInput = ref('')
function applyUrl() {
  if (urlInput.value.trim()) coverSrc.value = urlInput.value.trim()
}
function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) coverSrc.value = URL.createObjectURL(file)
}
</script>

<template>
  <div class="relative h-dvh w-full overflow-hidden bg-[#050506]">
    <!-- Scène 3D plein écran -->
    <TresCanvas
      :clear-color="darkMutedHex"
      render-mode="always"
      class="absolute inset-0"
    >
      <TresPerspectiveCamera
        ref="cameraRef"
        :position="[0, 1.5, 6.8]"
        :fov="45"
      />

      <ThreeSceneEnvironment />
      <ThreeLiquidBackground :palette="palette" />
      <ThreeVinylRecord
        :cover-src="coverSrc"
        :accent="vibrantHex"
        :speed="0.4"
      />

      <TresAmbientLight :intensity="0.35" />
      <TresDirectionalLight
        :position="[4, 6, 5]"
        :intensity="1.4"
      />
      <TresPointLight
        :color="vibrantHex"
        :position="[-4, 3, 3]"
        :intensity="12"
      />
      <TresPointLight
        :color="lightVibrantHex"
        :position="[4, 1, 4]"
        :intensity="9"
      />
      <TresPointLight
        :color="darkVibrantHex"
        :position="[0, 4, -2]"
        :intensity="6"
      />
    </TresCanvas>

    <!-- Overlay glassmorphism -->
    <div class="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 md:p-10">
      <!-- En-tête -->
      <div class="flex items-center gap-3">
        <div
          class="size-2.5 rounded-full"
          :style="{ backgroundColor: vibrantHex, boxShadow: `0 0 12px ${vibrantHex}` }"
        />
        <span class="text-sm font-medium tracking-widest text-white/70 uppercase">
          Now Playing
        </span>
        <span
          v-if="loading"
          class="text-xs text-white/40"
        >extraction…</span>
      </div>

      <!-- Carte "morceau en cours" -->
      <div class="pointer-events-auto w-full max-w-xl">
        <div
          class="flex items-center gap-4 rounded-3xl border border-white/15 p-4 shadow-2xl backdrop-blur-2xl"
          :style="{ backgroundColor: `${darkVibrantHex}26` }"
        >
          <img
            :src="coverSrc"
            alt="cover"
            class="size-20 shrink-0 rounded-2xl object-cover shadow-lg ring-1 ring-white/20"
          >
          <div class="min-w-0 flex-1">
            <input
              v-model="title"
              class="w-full truncate bg-transparent text-xl font-bold text-white outline-none"
            >
            <input
              v-model="artist"
              class="w-full truncate bg-transparent text-sm text-white/60 outline-none"
            >

            <!-- Palette extraite -->
            <div class="mt-3 flex gap-1.5">
              <span
                v-for="c in [vibrantHex, lightVibrantHex, darkVibrantHex]"
                :key="c"
                class="size-4 rounded-full ring-1 ring-white/30"
                :style="{ backgroundColor: c }"
              />
            </div>
          </div>
        </div>

        <!-- Changer de pochette -->
        <div class="mt-3 flex flex-col gap-2 sm:flex-row">
          <label
            class="cursor-pointer rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-center text-sm font-medium text-white backdrop-blur-xl transition hover:bg-white/20"
          >
            Choisir une image
            <input
              type="file"
              accept="image/*"
              class="hidden"
              @change="onFile"
            >
          </label>
          <div class="flex flex-1 gap-2">
            <input
              v-model="urlInput"
              placeholder="…ou coller une URL de pochette"
              class="flex-1 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none backdrop-blur-xl"
              @keyup.enter="applyUrl"
            >
            <button
              class="rounded-xl px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
              :style="{ backgroundColor: vibrantHex }"
              @click="applyUrl"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
