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
  /** Volume LOCAL (0–100) — n'affecte que ce navigateur. */
  volume?: number
}>()

const emit = defineEmits<{
  ended: []
  /** Progression émise en continu : { current, duration } en secondes. */
  progress: [payload: { current: number, duration: number }]
}>()

const host = ref<HTMLElement | null>(null)
const clip = ref<HTMLElement | null>(null)
const infoRef = ref<HTMLElement | null>(null)
let player: YTPlayer | null = null
let raf = 0

const ready = ref(false)
const fullscreen = ref(false)
// L'autoplay AVEC SON est bloqué tant que l'utilisateur n'a pas interagi.
// On affiche alors un overlay "Rejoindre l'écoute" ; le clic débloque tout.
const needsGesture = ref(false)

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

defineExpose({ seek, enterFullscreen, needsGesture, resume })

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
        e.target.setVolume(props.volume ?? 100)
        if (props.muted) e.target.mute()
        else e.target.unMute()
        if (props.playing !== false) {
          e.target.playVideo()
          // Si après un court délai la vidéo n'a pas démarré (autoplay son
          // bloqué), on demande un geste utilisateur.
          setTimeout(() => {
            if (player && props.playing !== false && player.getPlayerState() !== YT.PlayerState.PLAYING) {
              needsGesture.value = true
            }
          }, 1000)
        } else {
          e.target.pauseVideo()
        }
      },
      onStateChange: (e: { data: number }) => {
        // Dès que ça joue pour de vrai, plus besoin de l'overlay.
        if (e.data === YT.PlayerState.PLAYING) needsGesture.value = false
        if (e.data === YT.PlayerState.ENDED) emit('ended')
      }
    }
  })

  raf = requestAnimationFrame(tick)
  document.addEventListener('fullscreenchange', onFsChange)
})

/** Geste utilisateur : débloque le son et lance la lecture. */
function resume() {
  if (!player) return
  if (!props.muted) player.unMute()
  player.playVideo()
  needsGesture.value = false
}

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

watch(() => props.volume, (v) => {
  if (player && ready.value && typeof v === 'number') player.setVolume(v)
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
  <!-- Vignette : visible en haut à gauche sur desktop/tablette paysage (lg+).
       Sous lg (mobile + tablette portrait) elle est déportée hors-écran :
       l'iframe reste vivante (audio), le plein écran refonctionne, et le titre
       est affiché centré sous le disque par la page. -->
  <div class="pointer-events-auto absolute top-20 -left-[200vw] w-64 lg:left-10 lg:top-24 lg:w-72">
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

      <!-- Overlay "Rejoindre l'écoute" : le navigateur bloque l'autoplay
           avec son sans interaction. Le clic débloque le son + lance. -->
      <button
        v-if="needsGesture"
        type="button"
        class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/70 text-white backdrop-blur-sm transition hover:bg-black/60"
        @click="resume"
      >
        <UIcon
          name="i-lucide-volume-2"
          class="size-7"
        />
        <span class="text-sm font-semibold">Rejoindre l'écoute</span>
      </button>
    </div>

    <!-- Infos (titre/artiste) — masquées en plein écran -->
    <div
      v-if="!fullscreen"
      ref="infoRef"
      class="mt-3 text-white"
    >
      <VariableProximity
        v-if="title"
        :key="title"
        :label="title"
        from-font-variation-settings="'wght' 500"
        to-font-variation-settings="'wght' 900"
        :container-ref="infoRef"
        :radius="90"
        falloff="gaussian"
        class-name="block truncate text-sm font-variable"
      />
      <p
        v-if="artist"
        class="truncate text-xs text-white/55"
      >
        {{ artist }}
      </p>
    </div>
  </div>
</template>
