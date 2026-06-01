<script setup lang="ts">
import { useYoutubeIframeApi, type YTPlayer } from '~/composables/useYoutubeIframeApi'

const props = defineProps<{
  videoId: string | null
  title?: string
  artist?: string
  /** Vidéo muette (mode "même pièce" pour les invités). Permet l'autoplay. */
  muted?: boolean
  /** État lecture/pause partagé de la room. */
  playing?: boolean
}>()

const emit = defineEmits<{
  ended: []
  /** Progression émise en continu : { current, duration } en secondes. */
  progress: [payload: { current: number, duration: number }]
}>()

const host = ref<HTMLElement | null>(null)
const clip = ref<HTMLElement | null>(null)
let player: YTPlayer | null = null
let raf = 0

const ready = ref(false)
const fullscreen = ref(false)

function tick() {
  if (player && ready.value) {
    emit('progress', { current: player.getCurrentTime(), duration: player.getDuration() })
  }
  raf = requestAnimationFrame(tick)
}

/** Déplace la lecture (en secondes). Exposé au parent. */
function seek(seconds: number) {
  if (player && ready.value) player.seekTo(seconds, true)
}

/** Plein écran natif sur le clip. Sortie : Échap (natif) ou clic sur la vidéo. */
async function enterFullscreen() {
  if (!clip.value) return
  try {
    await clip.value.requestFullscreen()
  } catch {
    // certains navigateurs refusent hors interaction : sans effet
  }
}
async function exitFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen()
}
function onFsChange() {
  fullscreen.value = document.fullscreenElement === clip.value
}

defineExpose({ seek, enterFullscreen })

onMounted(async () => {
  if (!host.value) return
  const YT = await useYoutubeIframeApi()

  player = new YT.Player(host.value, {
    videoId: props.videoId ?? undefined,
    playerVars: {
      autoplay: 1,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      mute: props.muted ? 1 : 0
    },
    events: {
      onReady: (e: { target: YTPlayer }) => {
        ready.value = true
        if (props.muted) e.target.mute()
        else e.target.unMute()
        if (props.playing !== false) e.target.playVideo()
        else e.target.pauseVideo()
      },
      onStateChange: (e: { data: number }) => {
        if (e.data === YT.PlayerState.ENDED) emit('ended')
      }
    }
  })

  raf = requestAnimationFrame(tick)
  document.addEventListener('fullscreenchange', onFsChange)
})

watch(() => props.videoId, (id) => {
  if (player && ready.value && id) {
    player.loadVideoById(id)
    emit('progress', { current: 0, duration: 0 })
  }
})

watch(() => props.muted, (m) => {
  if (!player || !ready.value) return
  if (m) player.mute()
  else player.unMute()
})

watch(() => props.playing, (p) => {
  if (!player || !ready.value) return
  if (p === false) player.pauseVideo()
  else player.playVideo()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  document.removeEventListener('fullscreenchange', onFsChange)
  player?.destroy()
  player = null
})
</script>

<template>
  <div class="pointer-events-auto absolute left-6 top-20 w-64 md:left-10 md:top-24 md:w-72">
    <!-- Clip -->
    <!-- En mode normal : faux read-only (le calque bloque les clics vers
         l'iframe, sans rien déclencher). En plein écran natif : le calque
         devient cliquable pour sortir, et la vidéo remplit l'écran. -->
    <div
      ref="clip"
      class="relative overflow-hidden bg-black shadow-2xl"
      :class="fullscreen
        ? 'flex items-center justify-center'
        : 'aspect-video rounded-2xl border border-white/15'"
    >
      <!-- Conteneur monté par l'API YouTube (remplacé par une iframe).
           pointer-events-none : YouTube ne reçoit jamais la souris → pas
           d'overlay de lecture/pause au survol. -->
      <div
        class="pointer-events-none"
        :class="fullscreen ? 'aspect-video h-full max-h-full w-full max-w-full' : 'size-full'"
      >
        <div
          ref="host"
          class="size-full"
        />
      </div>

      <!-- Calque : bloque les clics vers YouTube. En plein écran, un clic sort. -->
      <button
        type="button"
        class="absolute inset-0 z-10 w-full bg-transparent"
        :class="fullscreen ? 'cursor-zoom-out' : 'cursor-default'"
        :aria-label="fullscreen ? 'Quitter le plein écran' : 'Clip'"
        :tabindex="fullscreen ? 0 : -1"
        @click="fullscreen && exitFullscreen()"
      />
    </div>

    <!-- Infos (titre/artiste) — masquées en plein écran -->
    <div
      v-if="!fullscreen"
      class="mt-3 text-white"
    >
      <p
        v-if="title"
        class="truncate text-sm font-semibold"
      >
        {{ title }}
      </p>
      <p
        v-if="artist"
        class="truncate text-xs text-white/55"
      >
        {{ artist }}
      </p>
    </div>
  </div>
</template>
