<script setup lang="ts">
import { useYoutubeIframeApi, type YTPlayer } from '~/composables/useYoutubeIframeApi'

const props = defineProps<{
  videoId: string | null
  title?: string
  artist?: string
}>()

const emit = defineEmits<{ ended: [] }>()

const host = ref<HTMLElement | null>(null)
let player: YTPlayer | null = null
let raf = 0

const ready = ref(false)
const current = ref(0)
const duration = ref(0)
const fullscreen = ref(false)

const progress = computed(() => (duration.value ? current.value / duration.value : 0))

function fmt(s: number) {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

function tick() {
  if (player && ready.value) {
    current.value = player.getCurrentTime()
    duration.value = player.getDuration()
  }
  raf = requestAnimationFrame(tick)
}

onMounted(async () => {
  if (!host.value) return
  const YT = await useYoutubeIframeApi()

  player = new YT.Player(host.value, {
    videoId: props.videoId ?? undefined,
    playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
    events: {
      onReady: (e: { target: YTPlayer }) => {
        ready.value = true
        e.target.playVideo()
      },
      onStateChange: (e: { data: number }) => {
        if (e.data === YT.PlayerState.ENDED) emit('ended')
      }
    }
  })

  raf = requestAnimationFrame(tick)
})

watch(() => props.videoId, (id) => {
  if (player && ready.value && id) {
    player.loadVideoById(id)
    current.value = 0
    duration.value = 0
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  player?.destroy()
  player = null
})
</script>

<template>
  <div
    class="pointer-events-auto"
    :class="fullscreen
      ? 'fixed inset-0 z-50 flex flex-col bg-black/95 p-6 backdrop-blur-md'
      : 'absolute bottom-6 left-6 w-72 md:bottom-10 md:left-10'"
  >
    <!-- Clip -->
    <div
      class="group relative overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl"
      :class="fullscreen ? 'mx-auto aspect-video w-full max-w-5xl flex-1' : 'aspect-video cursor-zoom-in'"
      @click="!fullscreen && (fullscreen = true)"
    >
      <!-- Conteneur monté par l'API YouTube (remplacé par une iframe) -->
      <div class="size-full">
        <div
          ref="host"
          class="size-full"
        />
      </div>

      <!-- Voile + loupe au survol (mode coin) -->
      <div
        v-if="!fullscreen"
        class="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30"
      >
        <UIcon
          name="i-lucide-maximize-2"
          class="size-6 text-white opacity-0 transition group-hover:opacity-100"
        />
      </div>

      <!-- Fermer le plein écran -->
      <button
        v-if="fullscreen"
        class="absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
        aria-label="Quitter le plein écran"
        @click.stop="fullscreen = false"
      >
        <UIcon
          name="i-lucide-x"
          class="size-5"
        />
      </button>
    </div>

    <!-- Infos + timeline -->
    <div :class="fullscreen ? 'mx-auto mt-5 w-full max-w-5xl text-white' : 'mt-3 text-white'">
      <p
        v-if="title"
        class="truncate font-semibold"
        :class="fullscreen ? 'text-xl' : 'text-sm'"
      >
        {{ title }}
      </p>
      <p
        v-if="artist"
        class="truncate text-white/55"
        :class="fullscreen ? 'text-base' : 'text-xs'"
      >
        {{ artist }}
      </p>

      <!-- Barre de progression custom -->
      <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/15">
        <div
          class="h-full rounded-full bg-white transition-[width] duration-300 ease-linear"
          :style="{ width: `${progress * 100}%` }"
        />
      </div>
      <div class="mt-1 flex justify-between text-[11px] tabular-nums text-white/40">
        <span>{{ fmt(current) }}</span>
        <span>{{ fmt(duration) }}</span>
      </div>
    </div>
  </div>
</template>
