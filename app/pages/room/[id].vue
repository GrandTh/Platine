<script setup lang="ts">
import type { PerspectiveCamera } from 'three'
import { userColor } from '~/composables/useUserColor'

const route = useRoute()
const roomId = computed(() => String(route.params.id).toUpperCase())

// Intention de création, déposée en sessionStorage par la home (pas dans
// l'URL → URL propre /room/CODE). Présente uniquement chez le créateur ;
// consommée une fois (un refresh ne recrée pas la room — elle est déjà en DB).
const createKey = `platine:create:${roomId.value}`
let intent: { mode?: 'speaker' | 'each' } = {}
if (import.meta.client) {
  const raw = sessionStorage.getItem(createKey)
  if (raw) {
    try {
      intent = JSON.parse(raw)
    } catch {
      intent = {}
    }
    sessionStorage.removeItem(createKey)
  }
}
const wantHost = !!intent.mode
const urlMode = intent.mode === 'speaker' ? 'speaker' : 'each'

const uid = useAnonId()

// Cycle de vie + config réelle de la room (mode/hôte lus en DB).
// Tout le monde voit le clip ; en mode 'speaker', seuls les invités sont muets.
const {
  exists, ready, mode, isHost, playing, togglePlaying,
  broadcastSeek, onSeek, currentTrackId, setCurrentTrack
} = useRoomLifecycle(roomId.value, uid, wantHost, urlMode)
const muted = computed(() => mode.value === 'speaker' && !isHost.value)

// File de morceaux + votes (temps réel via Supabase)
const { tracks, sorted, addTrack, addMany, toggleVote, removeTrack, hasVoted, isQueued } = useQueue(roomId.value, uid)

// Membres de la room (présence + noms personnalisables, couleur par uid)
const { members, myName, rename } = useMembers(roomId.value, uid)

// Onglets du panneau latéral : file d'attente / membres
const panelTab = ref<'queue' | 'members'>('queue')

// Rename inline
const renaming = ref(false)
const nameDraft = ref('')
function startRename() {
  nameDraft.value = myName.value
  renaming.value = true
}
function confirmRename() {
  rename(nameDraft.value)
  renaming.value = false
}

// Le morceau en lecture est FIGÉ par la room (current_track_id), pas par les
// votes : il joue jusqu'au bout/skip, et les votes ne réordonnent que la suite.
const nowPlaying = computed(() => sorted.value.find(t => t.id === currentTrackId.value) ?? null)
// File "à venir" = tout sauf le morceau en cours, triée par votes.
const upNext = computed(() => sorted.value.filter(t => t.id !== currentTrackId.value))

// Orchestration (hôte) : si aucun morceau courant valide mais la file n'est
// pas vide, on lance le plus voté. Couvre le 1er ajout et les cas limites.
watch([currentTrackId, sorted, isHost, ready], () => {
  if (!isHost.value || !ready.value) return
  const currentValid = currentTrackId.value && sorted.value.some(t => t.id === currentTrackId.value)
  if (!currentValid) {
    setCurrentTrack(sorted.value[0]?.id ?? null)
  }
}, { immediate: true })

// --- Progression + seek (timeline) ---
const playerRef = useTemplateRef<{ seek: (s: number) => void, enterFullscreen: () => void }>('playerRef')
const current = ref(0)
const duration = ref(0)
const progress = computed(() => (duration.value ? current.value / duration.value : 0))

function onProgress(p: { current: number, duration: number }) {
  current.value = p.current
  duration.value = p.duration
}

function fmt(s: number) {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// Clic sur la timeline (hôte) → seek local + diffusion à tous.
function onSeekRatio(ratio: number) {
  if (!isHost.value || !duration.value) return
  const seconds = ratio * duration.value
  playerRef.value?.seek(seconds)
  broadcastSeek(seconds)
}

// Réception d'un seek de l'hôte → on cale le player local.
onSeek((seconds) => {
  playerRef.value?.seek(seconds)
})

// Avance au morceau suivant (hôte) : retire le morceau courant, puis désigne
// le plus voté de la suite comme nouveau morceau en cours.
function advance() {
  if (!isHost.value) return
  const finished = currentTrackId.value
  const next = upNext.value[0]?.id ?? null
  setCurrentTrack(next)
  if (finished) removeTrack(finished)
}
function onTrackEnded() {
  advance()
}
function nextTrack() {
  advance()
}

// Recherche YouTube (débouncée, via la route serveur)
const { query: search, results, loading: searching, clear, playlistId, submit: submitSearch } = useYoutubeSearch()

function pick(result: { videoId: string, title: string, channel: string, thumbnail: string }) {
  addTrack({
    title: result.title,
    artist: result.channel,
    cover: result.thumbnail,
    source: 'youtube',
    externalId: result.videoId
  })
  clear()
}

// Import d'une playlist YouTube (jusqu'à 50 morceaux, 0 vote = fallback).
const importing = ref(false)
const importMsg = ref('')
async function importPlaylist() {
  if (!playlistId.value || importing.value) return
  importing.value = true
  importMsg.value = ''
  try {
    const list = await $fetch<{ videoId: string, title: string, channel: string, thumbnail: string }[]>(
      '/api/playlist', { query: { id: playlistId.value } }
    )
    const added = await addMany(list.map(r => ({
      title: r.title,
      artist: r.channel,
      cover: r.thumbnail,
      source: 'youtube' as const,
      externalId: r.videoId
    })))
    importMsg.value = added > 0 ? `${added} morceau(x) ajouté(s)` : 'Déjà dans la file'
    clear()
  } catch {
    importMsg.value = 'Import impossible'
  } finally {
    importing.value = false
    setTimeout(() => (importMsg.value = ''), 2500)
  }
}

// La pochette du morceau en lecture pilote la palette / le fond.
const { palette, extract } = useAlbumPalette()
const coverSrc = computed(() => nowPlaying.value?.cover ?? '/sample-cover.svg')
watch(coverSrc, src => extract(src), { immediate: true })

const hex = (key: keyof typeof palette.value) =>
  computed(() => `#${palette.value[key].getHexString()}`)
const vibrantHex = hex('vibrant')
const lightVibrantHex = hex('lightVibrant')
const darkMutedHex = hex('darkMuted')

// Couleur d'accent en RGB 0–1 pour le shader de la timeline.
const vibrantRgb = computed<[number, number, number]>(() => {
  const c = palette.value.vibrant
  return [c.r, c.g, c.b]
})

const cameraRef = shallowRef<PerspectiveCamera | null>(null)
watch(cameraRef, cam => cam?.lookAt(0, 0, 0))

// Copier le lien d'invitation — URL propre (code seul), sans les paramètres
// host/source/mode : les invités ne doivent pas hériter du rôle d'hôte.
const copied = ref(false)
async function copyLink() {
  const url = `${window.location.origin}/room/${roomId.value}`
  try {
    // clipboard API : nécessite un contexte sécurisé (https/localhost).
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url)
    } else {
      throw new Error('clipboard indisponible')
    }
  } catch {
    // Fallback universel : textarea hors-écran + execCommand('copy').
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } catch {
      // ignoré : au pire l'utilisateur copie le lien à la main
    }
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1800)
}
</script>

<template>
  <!-- Room introuvable (invité arrivant sur une room fermée/expirée) -->
  <div
    v-if="ready && !exists"
    class="grid h-dvh w-full place-items-center bg-[#070510] px-6 text-center text-white"
  >
    <div>
      <UIcon
        name="i-lucide-disc-3"
        class="mx-auto size-12 text-white/30"
      />
      <h1 class="mt-4 text-2xl font-bold">
        Room introuvable
      </h1>
      <p class="mt-2 text-white/55">
        Cette room n'existe pas ou a été fermée par son hôte.
      </p>
      <NuxtLink
        to="/"
        class="mt-6 inline-block rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-6 py-3 font-semibold"
      >
        Retour à l'accueil
      </NuxtLink>
    </div>
  </div>

  <div
    v-else
    class="relative h-dvh w-full overflow-hidden bg-[#050506] text-white"
  >
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
        :playing="playing && !!nowPlaying"
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
    </TresCanvas>

    <!-- ───────── Barre du haut ───────── -->
    <header class="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-5 md:p-8">
      <div class="pointer-events-auto flex items-center gap-3">
        <NuxtLink
          to="/"
          class="grid size-10 place-items-center rounded-full border border-white/15 bg-white/10 backdrop-blur-xl transition hover:bg-white/20"
          aria-label="Accueil"
        >
          <UIcon
            name="i-lucide-arrow-left"
            class="size-5"
          />
        </NuxtLink>

        <div class="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur-xl">
          <UIcon
            name="i-lucide-lock"
            class="size-3.5 text-white/60"
          />
          <span class="text-sm font-semibold tracking-[0.2em]">{{ roomId }}</span>
          <span class="text-xs text-white/45">· privée</span>
        </div>

        <!-- Mode d'écoute -->
        <div class="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-xl">
          <UIcon
            :name="mode === 'speaker' ? 'i-lucide-volume-2' : 'i-lucide-laptop'"
            class="size-4 text-white/70"
          />
          <span class="hidden text-xs text-white/60 sm:inline">
            {{ mode === 'speaker' ? 'Même pièce' : 'Chacun son ordi' }}
          </span>
        </div>
      </div>

      <button
        class="pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
        :style="{ backgroundColor: vibrantHex }"
        @click="copyLink"
      >
        <UIcon
          :name="copied ? 'i-lucide-check' : 'i-lucide-link'"
          class="size-4"
        />
        {{ copied ? 'Lien copié !' : 'Inviter' }}
      </button>
    </header>

    <!-- ───────── Player du morceau en lecture ───────── -->
    <YoutubePlayer
      v-if="nowPlaying"
      ref="playerRef"
      :key="nowPlaying.id"
      :video-id="nowPlaying.externalId"
      :title="nowPlaying.title"
      :artist="nowPlaying.artist"
      :muted="muted"
      :playing="playing"
      @ended="onTrackEnded"
      @progress="onProgress"
    />

    <!-- ───────── Timeline (Threads) pleine largeur + contrôles ───────── -->
    <div
      v-if="nowPlaying"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center"
    >
      <!-- Threads : remplissage selon la progression, seek si hôte.
           Hauteur réduite pour que le ruban reste sous le vinyle, juste
           au-dessus des contrôles (l'épaisseur du trait vient du shader). -->
      <div class="pointer-events-auto h-16 w-full md:h-20">
        <TimelineThreads
          :progress="progress"
          :fill-color="vibrantRgb"
          :seekable="isHost"
          @seek="onSeekRatio"
        />
      </div>

      <!-- Temps -->
      <div class="pointer-events-none -mt-2 flex w-full justify-between px-5 text-[11px] tabular-nums text-white/45 md:px-8">
        <span>{{ fmt(current) }}</span>
        <span>{{ fmt(duration) }}</span>
      </div>

      <!-- Contrôles centrés -->
      <div class="pointer-events-auto mt-1 mb-5 flex items-center gap-4">
        <!-- Plein écran du clip (pour tout le monde) -->
        <button
          class="grid size-11 place-items-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20"
          aria-label="Plein écran"
          @click="playerRef?.enterFullscreen()"
        >
          <UIcon
            name="i-lucide-expand"
            class="size-5"
          />
        </button>

        <!-- Pause/play + morceau suivant : hôte uniquement -->
        <template v-if="isHost">
          <button
            class="grid size-12 place-items-center rounded-full text-black shadow-lg transition hover:scale-105"
            :style="{ backgroundColor: vibrantHex }"
            :aria-label="playing ? 'Pause' : 'Lecture'"
            @click="togglePlaying"
          >
            <UIcon
              :name="playing ? 'i-lucide-pause' : 'i-lucide-play'"
              class="size-6"
            />
          </button>
          <button
            class="grid size-11 place-items-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20"
            aria-label="Morceau suivant"
            @click="nextTrack"
          >
            <UIcon
              name="i-lucide-skip-forward"
              class="size-5"
            />
          </button>
        </template>
      </div>
    </div>

    <!-- ───────── Panneau file d'attente ───────── -->
    <!-- pointer-events-none sur l'aside : sa zone transparente (haut, en
         desktop md:inset-y-0) ne doit pas intercepter les clics du header.
         Le panneau interne réactive les events. -->
    <aside class="pointer-events-none absolute inset-x-0 bottom-0 p-4 md:inset-y-0 md:right-0 md:left-auto md:flex md:w-96 md:items-center md:p-6">
      <div class="pointer-events-auto flex max-h-[45dvh] w-full flex-col rounded-3xl border border-white/15 bg-black/30 p-5 backdrop-blur-2xl md:max-h-[80dvh]">
        <!-- Onglets : file d'attente / membres -->
        <div class="flex items-center gap-1 rounded-xl bg-white/5 p-1">
          <button
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition"
            :class="panelTab === 'queue' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'"
            @click="panelTab = 'queue'"
          >
            <UIcon
              name="i-lucide-list-music"
              class="size-4"
            />
            File
            <span class="rounded-full bg-white/10 px-1.5 text-xs">{{ tracks.length }}</span>
          </button>
          <button
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition"
            :class="panelTab === 'members' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'"
            @click="panelTab = 'members'"
          >
            <UIcon
              name="i-lucide-users"
              class="size-4"
            />
            Membres
            <span class="rounded-full bg-white/10 px-1.5 text-xs">{{ members.length }}</span>
          </button>
        </div>

        <!-- ───── Onglet MEMBRES ───── -->
        <div
          v-if="panelTab === 'members'"
          class="mt-4 flex-1 overflow-y-auto"
        >
          <ul class="space-y-1.5">
            <li
              v-for="m in members"
              :key="m.uid"
              class="flex items-center gap-3 rounded-xl bg-white/5 p-2.5"
            >
              <span
                class="size-3 shrink-0 rounded-full"
                :style="{ backgroundColor: m.color }"
              />
              <!-- Édition du nom (soi-même) -->
              <template v-if="m.isSelf && renaming">
                <input
                  v-model="nameDraft"
                  maxlength="24"
                  class="min-w-0 flex-1 rounded-md bg-white/10 px-2 py-1 text-sm outline-none"
                  @keyup.enter="confirmRename"
                  @blur="confirmRename"
                >
              </template>
              <template v-else>
                <span class="min-w-0 flex-1 truncate text-sm">
                  {{ m.name }}
                  <span
                    v-if="m.isSelf"
                    class="text-xs text-white/40"
                  >(vous)</span>
                </span>
                <button
                  v-if="m.isSelf"
                  class="shrink-0 text-white/40 transition hover:text-white"
                  aria-label="Changer mon nom"
                  @click="startRename"
                >
                  <UIcon
                    name="i-lucide-pencil"
                    class="size-4"
                  />
                </button>
              </template>
            </li>
          </ul>
        </div>

        <!-- ───── Onglet FILE ───── -->
        <!-- Recherche YouTube -->
        <div
          v-show="panelTab === 'queue'"
          class="relative mt-4"
        >
          <div class="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
            <UIcon
              :name="searching ? 'i-lucide-loader-circle' : 'i-lucide-search'"
              class="size-4 text-white/40"
              :class="{ 'animate-spin': searching }"
            />
            <input
              v-model="search"
              placeholder="Rechercher (Entrée) ou coller une playlist…"
              class="w-full bg-transparent text-sm outline-none placeholder:text-white/40"
              @keyup.enter="submitSearch"
            >
            <button
              v-if="search"
              class="text-white/40 transition hover:text-white"
              aria-label="Effacer"
              @click="clear"
            >
              <UIcon
                name="i-lucide-x"
                class="size-4"
              />
            </button>
          </div>

          <!-- URL de playlist détectée → bouton d'import (max 50, 0 vote) -->
          <button
            v-if="playlistId"
            class="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
            :style="{ backgroundColor: vibrantHex }"
            :disabled="importing"
            @click="importPlaylist"
          >
            <UIcon
              :name="importing ? 'i-lucide-loader-circle' : 'i-lucide-list-plus'"
              class="size-4"
              :class="{ 'animate-spin': importing }"
            />
            {{ importing ? 'Import en cours…' : 'Importer la playlist (max 50)' }}
          </button>
          <p
            v-if="importMsg"
            class="mt-2 text-center text-xs text-white/60"
          >
            {{ importMsg }}
          </p>

          <!-- Résultats -->
          <ul
            v-if="results.length"
            class="absolute z-20 mt-2 max-h-72 w-full space-y-1 overflow-y-auto rounded-xl border border-white/15 bg-black/80 p-2 backdrop-blur-2xl"
          >
            <li
              v-for="r in results"
              :key="r.videoId"
            >
              <button
                class="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-white/10"
                @click="pick(r)"
              >
                <img
                  :src="r.thumbnail"
                  alt=""
                  class="size-10 shrink-0 rounded object-cover"
                >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ r.title }}</span>
                  <span class="block truncate text-xs text-white/50">{{ r.channel }}</span>
                </span>
                <!-- Déjà dans la file → on propose un vote, pas un doublon -->
                <UIcon
                  v-if="isQueued('youtube', r.videoId)"
                  name="i-lucide-arrow-big-up"
                  class="size-4 shrink-0 text-fuchsia-400"
                />
                <UIcon
                  v-else
                  name="i-lucide-plus"
                  class="size-4 shrink-0 text-white/40"
                />
              </button>
            </li>
          </ul>
        </div>

        <!-- État vide (aucun morceau à venir) -->
        <div
          v-if="panelTab === 'queue' && upNext.length === 0"
          class="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center"
        >
          <UIcon
            name="i-lucide-music"
            class="size-8 text-white/25"
          />
          <p class="text-sm text-white/45">
            {{ nowPlaying ? 'Rien dans la file.' : 'La file est vide.' }}<br>
            Ajoutez un son pour la suite.
          </p>
        </div>

        <!-- File à venir (hors morceau en cours), triée par votes -->
        <ul
          v-else-if="panelTab === 'queue'"
          class="mt-3 flex-1 space-y-2 overflow-y-auto"
        >
          <li
            v-for="(track, i) in upNext"
            :key="track.id"
            class="flex items-center gap-3 rounded-xl bg-white/5 p-2.5 transition"
            :style="{ backgroundImage: `linear-gradient(to left, ${userColor(track.addedBy)}66 0%, transparent 25%)` }"
          >
            <span class="w-4 shrink-0 text-center text-sm text-white/40">{{ i + 1 }}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ track.title }}
              </p>
              <p class="truncate text-xs text-white/50">
                {{ track.artist || '—' }}
              </p>
            </div>

            <!-- Vote -->
            <button
              class="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold transition"
              :class="hasVoted(track)
                ? 'bg-white/90 text-black'
                : 'bg-white/10 text-white hover:bg-white/20'"
              :aria-pressed="hasVoted(track)"
              @click="toggleVote(track.id)"
            >
              <UIcon
                name="i-lucide-arrow-big-up"
                class="size-4"
              />
              {{ track.voters.length }}
            </button>

            <!-- Retirer (auteur ou hôte) -->
            <button
              v-if="track.addedBy === uid || isHost"
              class="shrink-0 text-white/30 transition hover:text-white/80"
              aria-label="Retirer"
              @click="removeTrack(track.id)"
            >
              <UIcon
                name="i-lucide-x"
                class="size-4"
              />
            </button>
          </li>
        </ul>

        <p class="mt-4 text-center text-xs text-white/30">
          {{ isHost ? 'Vous êtes l\'hôte de cette room.' : 'Vous avez rejoint cette room.' }}
        </p>
      </div>
    </aside>
  </div>
</template>
