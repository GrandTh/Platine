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
  /** Lecture/pause déclenchée DANS le lecteur (playbar YouTube native) →
   *  le parent (hôte) propage à la room. true = lecture, false = pause. */
  playstate: [playing: boolean]
}>()

const host = ref<HTMLElement | null>(null)
const clip = ref<HTMLElement | null>(null)
const infoRef = ref<HTMLElement | null>(null)
let player: YTPlayer | null = null
let raf = 0

// Lien public YouTube de la vidéo (titre cliquable → conformité III.I.4 : on ne
// désactive aucun lien et on offre un renvoi vers YouTube via le titre).
const watchUrl = computed(() =>
  props.videoId ? `https://www.youtube.com/watch?v=${props.videoId}` : null
)

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
      // controls: 1 → on garde la PLAYBAR YouTube native (conformité API : on ne
      // remplace/masque pas les attributs YouTube, cf. politique III.C.1).
      controls: 1,
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
        if (e.data === YT.PlayerState.PLAYING) {
          needsGesture.value = false
          emit('playstate', true)
        } else if (e.data === YT.PlayerState.PAUSED) {
          emit('playstate', false)
        }
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
  <!-- Vignette : visible partout (desktop ET mobile). Le lecteur YouTube reste
       PLEINEMENT interactif (playbar, titre, logo cliquables) et la taille est
       ≥ 200×200 px → conformité API YouTube (RMF III.C.1 + liens III.I.4). -->
  <div class="pointer-events-auto absolute top-20 left-3 z-20 w-[200px] lg:left-10 lg:top-24">
    <!-- Clip carré 200×200 (taille mini conforme à l'API YouTube). La vidéo 16:9
         est « boxée » dedans. Pas de bordure : le contenu reste à 200px pile
         (une bordure ramènerait l'iframe à 198 px < 200). -->
    <div
      ref="clip"
      class="relative overflow-hidden bg-black shadow-2xl"
      :class="fullscreen
        ? 'flex items-center justify-center'
        : 'size-[200px] rounded-2xl'"
    >
      <!-- Conteneur monté par l'API YouTube (remplacé par une iframe).
           INTERACTIF : on ne bloque plus les clics → la playbar et les liens
           YouTube (titre, logo, « Regarder sur YouTube ») fonctionnent. -->
      <div :class="fullscreen ? 'aspect-video h-full max-h-full w-full max-w-full' : 'size-full'">
        <div
          ref="host"
          class="size-full"
        />
      </div>

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

    <!-- Infos (titre/artiste) — masquées en plein écran. Le TITRE est un lien
         vers la vidéo sur YouTube (conformité III.I.4). -->
    <a
      v-if="!fullscreen && watchUrl"
      ref="infoRef"
      :href="watchUrl"
      target="_blank"
      rel="noopener"
      class="mt-3 block text-white transition hover:opacity-90"
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
        class-name="block truncate text-sm font-variable hover:underline"
      />
      <span
        v-if="artist"
        class="block truncate text-xs text-white/55"
      >
        {{ artist }}
      </span>
    </a>
  </div>
</template>
