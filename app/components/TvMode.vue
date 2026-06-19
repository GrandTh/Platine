<script setup lang="ts">
import type { QueueTrack } from '~/composables/useQueue'

/**
 * Mode TV : affichage d'ambiance plein écran, pensé pour une télé / un
 * projecteur. On reprend les données temps réel de la room (morceau en cours +
 * file à venir) dans un layout dépouillé : pochette + vinyle 2D (CSS, pas de
 * 3D → léger sur une TV laissée branchée des heures), playlist transparente à
 * droite, timeline en bas. L'audio reste géré par le YoutubePlayer de la room
 * (qui continue de tourner derrière cet overlay).
 */
const props = defineProps<{
  /** Id du morceau en cours : sert de clé à la transition de changement. */
  trackId: string
  cover: string
  title: string
  artist: string
  /** File à venir (morceau courant exclu) pour la colonne de droite. */
  upNext: QueueTrack[]
  playing: boolean
  progress: number
  current: number
  duration: number
  isHost: boolean
  /** Couleurs dérivées de la pochette (palette). */
  accent: string
  bg: string
}>()

const emit = defineEmits<{ exit: [], seek: [ratio: number] }>()

const { t } = useI18n()

// Fond : base opaque (quasi-noir) + deux halos colorés issus de la palette,
// comme la maquette. La base opaque masque entièrement la room derrière.
const bgStyle = computed(() => ({
  backgroundColor: '#050506',
  backgroundImage:
    `radial-gradient(120% 120% at 28% 20%, ${props.accent}59 0%, transparent 55%),`
    + `radial-gradient(120% 120% at 78% 88%, ${props.bg} 0%, transparent 60%)`
}))

function fmt(s: number) {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// Dégradé de la playlist : le prochain morceau (en haut) est le plus blanc,
// chaque suivant est un peu plus estompé. Opacité décroissante par position.
function itemOpacity(i: number) {
  return String(Math.max(0.22, 1 - i * 0.16))
}

// Seek (hôte) au clic sur la timeline → ratio 0..1 émis au parent.
const trackRef = ref<HTMLElement | null>(null)
function onTrackClick(e: MouseEvent) {
  if (!props.isHost || !trackRef.value) return
  const rect = trackRef.value.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  emit('seek', ratio)
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 overflow-hidden text-white"
    :style="bgStyle"
  >
    <!-- Sortie du mode TV : focusable au D-pad (anneau de focus visible). -->
    <button
      class="absolute right-5 top-5 z-20 grid size-11 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/10 text-white/80 backdrop-blur-xl transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      :aria-label="t('room.tvExit')"
      @click="emit('exit')"
    >
      <UIcon
        name="i-lucide-shrink"
        class="size-5"
      />
    </button>

    <!-- ───────── Playlist à venir (droite, transparente, fondue) ───────── -->
    <div class="pointer-events-none absolute inset-y-0 right-0 flex w-[42%] items-center justify-end pr-6 sm:w-[34%] sm:pr-10 lg:w-[30%]">
      <div class="playlist-fade max-h-[78%] w-full overflow-hidden">
        <ul class="space-y-3 text-right sm:space-y-4">
          <li
            v-for="(tr, i) in upNext"
            :key="tr.id"
            class="leading-tight"
            :style="{ opacity: itemOpacity(i) }"
          >
            <p class="truncate text-sm font-semibold text-white sm:text-base">
              {{ tr.title }}
            </p>
            <p class="truncate text-[11px] text-white/55 sm:text-xs">
              {{ tr.artist || '—' }}
            </p>
          </li>
        </ul>
      </div>
    </div>

    <!-- ───────── Pochette + vinyle 2D + bloc « en lecture » ───────── -->
    <!-- Changement de morceau : la pochette « arrive de la droite » et le titre
         fait un fade-in droite→gauche (clé = trackId → la transition rejoue). -->
    <Transition
      name="tv-track"
      mode="out-in"
    >
      <div
        :key="trackId"
        class="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 pr-[42%] sm:pr-[34%] lg:flex-row lg:gap-12 lg:pr-[30%]"
      >
        <div class="vinyl shrink-0">
          <!-- Vinyle qui dépasse derrière la pochette ; tourne en CSS. -->
          <div class="disc-pos">
            <div
              class="disc"
              :class="{ spinning: playing }"
              :style="{ '--accent': accent } as Record<string, string>"
            />
          </div>
          <!-- Pochette de l'album (carré). -->
          <img
            :src="cover"
            alt=""
            class="cover"
          >
        </div>

        <div class="tv-text min-w-0 max-w-full text-center lg:max-w-md lg:text-left">
          <p class="mb-2 text-xs font-medium tracking-[0.3em] text-white/45 uppercase">
            {{ t('panel.nowPlaying') }}
          </p>
          <h2 class="line-clamp-2 text-2xl font-bold leading-tight sm:text-4xl lg:text-5xl">
            {{ title }}
          </h2>
          <p class="mt-2 truncate text-base text-white/55 sm:text-lg">
            {{ artist || '—' }}
          </p>
        </div>
      </div>
    </Transition>

    <!-- ───────── Timeline (conservée) ───────── -->
    <div class="absolute inset-x-0 bottom-0 px-6 pb-6 sm:px-10 sm:pb-8">
      <div
        ref="trackRef"
        class="group relative -my-3 py-3"
        :class="isHost ? 'cursor-pointer' : ''"
        @click="onTrackClick"
      >
        <div class="relative h-1.5 w-full rounded-full bg-white/15 transition-all group-hover:h-2.5">
          <div
            class="absolute inset-y-0 left-0 rounded-full bg-white"
            :style="{ width: `${progress * 100}%` }"
          />
          <div
            v-if="isHost"
            class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
            :style="{ left: `${progress * 100}%` }"
          />
        </div>
      </div>
      <div class="mt-1.5 flex justify-between text-[11px] tabular-nums text-white/50">
        <span>{{ fmt(current) }}</span>
        <span>{{ fmt(duration) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vinyl {
  position: relative;
  width: clamp(170px, 34vmin, 440px);
  aspect-ratio: 1;
}

/* Pochette : carré au-dessus du vinyle. */
.cover {
  position: relative;
  z-index: 2;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
}

/* Le vinyle est décalé vers la droite pour dépasser derrière la pochette. */
.disc-pos {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 62%;
  width: 96%;
  transform: translate(-50%, -50%);
}

.disc {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 9999px;
  /* Sillons (anneaux fins) au-dessus d'un label coloré central, sur corps noir. */
  background-image:
    repeating-radial-gradient(circle at center, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 4px),
    radial-gradient(circle at center, var(--accent, #7c5cff) 0 13%, #0c0c0f 13.5% 100%);
  background-color: #08080a;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.05),
    0 25px 70px rgba(0, 0, 0, 0.7);
}

/* Trou central. */
.disc::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2.5%;
  aspect-ratio: 1;
  border-radius: 9999px;
  background: #050506;
  transform: translate(-50%, -50%);
}

.disc.spinning {
  animation: tv-spin 6s linear infinite;
}

@keyframes tv-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .disc.spinning {
    animation: none;
  }
}

/* ───────── Transition de changement de morceau ─────────
   Le nouveau bloc « arrive de la droite » : la pochette glisse + scale, le
   titre fait un fade-in décalé (droite→gauche). L'ancien s'efface vers la
   gauche (out-in → un seul bloc à l'écran à la fois). */
.tv-track-enter-active .vinyl {
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease;
  transition-delay: 0.05s;
}
.tv-track-enter-active .tv-text {
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease;
  transition-delay: 0.14s;
}
.tv-track-enter-from .vinyl {
  transform: translateX(90px) scale(0.95);
  opacity: 0;
}
.tv-track-enter-from .tv-text {
  transform: translateX(48px);
  opacity: 0;
}

.tv-track-leave-active .vinyl,
.tv-track-leave-active .tv-text {
  transition: transform 0.28s ease-in, opacity 0.28s ease-in;
}
.tv-track-leave-to .vinyl {
  transform: translateX(-44px) scale(0.97);
  opacity: 0;
}
.tv-track-leave-to .tv-text {
  transform: translateX(-32px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tv-track-enter-active .vinyl,
  .tv-track-enter-active .tv-text,
  .tv-track-leave-active .vinyl,
  .tv-track-leave-active .tv-text {
    transition: opacity 0.3s ease;
  }
  .tv-track-enter-from .vinyl,
  .tv-track-enter-from .tv-text,
  .tv-track-leave-to .vinyl,
  .tv-track-leave-to .tv-text {
    transform: none;
  }
}

/* Playlist : le dégradé d'opacité (par item) fait l'estompage vers le bas ;
   ce masque ne sert qu'à couper proprement un éventuel débordement en bas. */
.playlist-fade {
  -webkit-mask-image: linear-gradient(to bottom, #000 0, #000 90%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 0, #000 90%, transparent 100%);
}
</style>
