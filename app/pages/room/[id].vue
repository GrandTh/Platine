<script setup lang="ts">
import type { PerspectiveCamera } from 'three'
import { emojiToCode, twemojiUrl, useEmotes } from '~/composables/useEmotes'

const { t } = useI18n()
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
  exists, ready, mode, isHost, playing, togglePlaying, setPlaying,
  broadcastSeek, onSeek, currentTrackId, setCurrentTrack,
  shuffleSeed, reshuffle, autoplay, setAutoplay
} = useRoomLifecycle(roomId.value, uid, wantHost, urlMode)
const muted = computed(() => mode.value === 'speaker' && !isHost.value)

// Lecture/pause depuis la playbar YouTube native : si c'est l'HÔTE, on propage
// à toute la room (les autres lecteurs + le disque suivent l'état `playing`).
// `setPlaying` est no-op si l'état ne change pas → pas de boucle de feedback.
function onPlayerState(isPlaying: boolean) {
  if (isHost.value) setPlaying(isPlaying)
}

// Volume LOCAL (0–100) : propre à CE navigateur (via l'API YouTube), n'affecte
// pas les autres participants. Mémorisé en localStorage.
const volume = ref(100)
if (import.meta.client) {
  const raw = localStorage.getItem('platine:volume')
  if (raw !== null) {
    const saved = Number(raw)
    if (Number.isFinite(saved) && saved >= 0 && saved <= 100) volume.value = saved
  }
}
watch(volume, (v) => {
  if (import.meta.client) localStorage.setItem('platine:volume', String(v))
})

// Coupe/rétablit le son localement (clic sur l'icône volume).
let prevVolume = 100
function toggleMuteLocal() {
  if (volume.value > 0) {
    prevVolume = volume.value
    volume.value = 0
  } else {
    volume.value = prevVolume || 100
  }
}

const volIcon = computed(() =>
  volume.value === 0
    ? 'i-lucide-volume-x'
    : volume.value < 50
      ? 'i-lucide-volume-1'
      : 'i-lucide-volume-2')

// File de morceaux + votes (temps réel via Supabase)
const { tracks, sorted, addTrack, addMany, toggleVote, removeTrack, clearQueue, hasVoted, isQueued } = useQueue(roomId.value, uid, shuffleSeed)

// Membres de la room (présence + noms personnalisables, couleur par uid).
// On attend `ready` : la room doit exister avant l'insert (FK members→rooms).
const { members, myName, iAmMuted, rename, colorFor, moderate } = useMembers(roomId.value, uid, ready)

// Modération (hôte) : état de chargement par membre + action groupée.
const moderatingUids = ref(new Set<string>())
const moderatingAll = ref(false)

async function toggleMute(targetUid: string, muted: boolean) {
  if (moderatingUids.value.has(targetUid)) return
  moderatingUids.value = new Set(moderatingUids.value).add(targetUid)
  try {
    await moderate(targetUid, muted)
  } finally {
    const next = new Set(moderatingUids.value)
    next.delete(targetUid)
    moderatingUids.value = next
  }
}

// Les autres membres (hors soi) — cible de l'action groupée « tout (dé)muter ».
const otherMembers = computed(() => members.value.filter(m => !m.isSelf))
const allOthersMuted = computed(() =>
  otherMembers.value.length > 0 && otherMembers.value.every(m => m.muted)
)

async function moderateAll(muted: boolean) {
  if (moderatingAll.value) return
  moderatingAll.value = true
  try {
    await Promise.all(
      otherMembers.value.filter(m => m.muted !== muted).map(m => moderate(m.uid, muted))
    )
  } finally {
    moderatingAll.value = false
  }
}

// Vote pour skip (invités). Quorum = 50% des invités présents (hôte exclu).
const {
  skipCount, hasVotedSkip, quorum, active: skipActive,
  lastVoterName, lastVoterColor, toggleSkipVote, onQuorum
} = useSkipVote(roomId.value, uid, currentTrackId, members)

// Emotes / réactions en temps réel (broadcast Supabase, rendu Twemoji).
// `recentEmotes` = barre des récents (par utilisateur) ; le sélecteur « … »
// donne accès à tous les emojis.
const { active: emotes, send: sendEmote, recent: recentEmotes, pushRecent } = useEmotes(roomId.value)

// Annonce admin (« god mode ») : overlay plein écran reçu en temps réel.
const { announcement } = useAnnouncements(roomId.value)
const emotePickerOpen = ref(false)

// Envoie un emoji ET comptabilise son usage (la barre est classée par usage,
// mais figée pendant la session → l'ordre ne bouge pas quand on spamme).
function react(code: string, char: string) {
  sendEmote(code)
  pushRecent(code, char)
}

// Sélection depuis le picker emoji-mart : emoji natif → code Twemoji.
function onPickerSelect(native: string) {
  react(emojiToCode(native), native)
  emotePickerOpen.value = false
}

// Onglets du panneau latéral : recherche / playlist / membres
const panelTab = ref<'search' | 'queue' | 'members'>('queue')

// --- Bottom sheet (mobile + tablette portrait, < lg) ---
// Le panneau est un tiroir qu'on tire vers le haut. Replié : seule la poignée
// + la barre d'onglets dépassent (SHEET_PEEK). Au-dessus de lg : panneau
// latéral classique (le sheet est neutralisé en CSS).
const sheetRef = ref<HTMLElement | null>(null)
const sheetOpen = ref(false)
const sheetDrag = ref<number | null>(null) // translateY (px) pendant un drag
const SHEET_PEEK = 96 // px visibles quand replié — à garder synchro avec la classe translate-y
let dragStartY = 0
let dragStartT = 0

function sheetMax() {
  return (sheetRef.value?.offsetHeight ?? 0) - SHEET_PEEK
}
function onSheetDown(e: PointerEvent) {
  dragStartY = e.clientY
  dragStartT = sheetOpen.value ? 0 : sheetMax()
  sheetDrag.value = dragStartT
  window.addEventListener('pointermove', onSheetMove)
  window.addEventListener('pointerup', onSheetUp)
}
function onSheetMove(e: PointerEvent) {
  const max = sheetMax()
  sheetDrag.value = Math.max(0, Math.min(max, dragStartT + (e.clientY - dragStartY)))
}
function onSheetUp() {
  const max = sheetMax()
  const moved = Math.abs((sheetDrag.value ?? dragStartT) - dragStartT)
  if (moved < 5) {
    // Simple tap sur la poignée → bascule.
    sheetOpen.value = !sheetOpen.value
  } else {
    // Snap : ouvert si on a dépassé la moitié vers le haut.
    sheetOpen.value = (sheetDrag.value ?? max) < max / 2
  }
  sheetDrag.value = null
  window.removeEventListener('pointermove', onSheetMove)
  window.removeEventListener('pointerup', onSheetUp)
}
// Tap sur un onglet → ouvre le sheet (pratique sur mobile).
function openSheet() {
  sheetOpen.value = true
}

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

// Temps total de la file (en cours + à venir) ; durées inconnues comptées 0.
const totalDuration = computed(() => sorted.value.reduce((acc, t) => acc + (t.duration ?? 0), 0))
const totalDurationLabel = computed(() => {
  const s = totalDuration.value
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h ? `${h} h ${m.toString().padStart(2, '0')}` : `${m} min`
})

// Durée d'un morceau (m:ss ou h:mm:ss) ; null/0 → '' (inconnue, masquée).
function fmtDuration(s: number | null): string {
  if (!s || s <= 0) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// Orchestration (hôte) : si aucun morceau courant valide mais la file n'est
// pas vide, on lance le plus voté. Couvre le 1er ajout et les cas limites.
watch([currentTrackId, sorted, isHost, ready], () => {
  if (!isHost.value || !ready.value) return
  const currentValid = currentTrackId.value && sorted.value.some(t => t.id === currentTrackId.value)
  if (!currentValid) {
    setCurrentTrack(sorted.value[0]?.id ?? null)
  }
}, { immediate: true })

// Autoplay (hôte) : on garde TOUJOURS 1 morceau d'avance. Dès qu'il n'y a plus
// rien « à venir » après le morceau courant, on ajoute UN morceau populaire
// (0 quota) → file propre (courant + 1) et enchaînement sans trou. Anti-boucle :
// verrou de ré-entrance + délai mini, et on exclut les morceaux déjà en file.
// Verrou de ré-entrance : empêche deux ajouts concurrents. Pas de cooldown
// temporel (il bloquerait l'amorçage « courant + 1 ») : la condition
// `upNext.length === 0` s'éteint d'elle-même dès qu'on a 1 morceau d'avance.
let refilling = false
async function refillOne() {
  if (refilling) return
  refilling = true
  try {
    const pop = await $fetch<{ videoId: string, title: string, channel: string, thumbnail: string, duration?: number }[]>('/api/popular')
    const candidates = pop.filter(r => !isQueued('youtube', r.videoId))
    const r = candidates[Math.floor(Math.random() * candidates.length)]
    if (r) {
      await addTrack({
        title: r.title, artist: r.channel, cover: r.thumbnail,
        source: 'youtube', externalId: r.videoId, duration: r.duration
      }, false) // 0 vote : c'est un morceau de remplissage
    }
  } catch {
    // best-effort
  } finally {
    refilling = false
  }
}
// currentTrackId dans les deps : quand l'orchestration fige le morceau courant,
// `upNext` se vide → on re-déclenche pour remettre 1 morceau d'avance.
watch([sorted, currentTrackId, autoplay, isHost, ready], () => {
  if (ready.value && isHost.value && autoplay.value && upNext.value.length === 0) {
    refillOne()
  }
})

// --- Progression + seek (timeline) ---
const playerRef = useTemplateRef<{ seek: (s: number) => void, enterFullscreen: () => void, needsGesture: boolean, resume: () => void }>('playerRef')
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

// Clic sur la barre de progression : calcule le ratio depuis la position X.
const trackRef = ref<HTMLElement | null>(null)
function onTrackClick(e: MouseEvent) {
  if (!isHost.value || !trackRef.value) return
  const rect = trackRef.value.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  onSeekRatio(ratio)
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

// Quorum de votes skip atteint → seul l'hôte exécute le skip (autorité unique).
// advance() retire le morceau courant → ses skip_votes partent en cascade (DB).
onQuorum(() => {
  if (isHost.value) advance()
})
function nextTrack() {
  advance()
}

// Menu de skip de l'hôte : le clic sur le bouton skip ouvre deux choix en
// diagonale (proposer un vote à tous / passer directement). Un clic ailleurs
// referme sans agir.
const skipMenuOpen = ref(false)
function hostProposeSkip() {
  skipMenuOpen.value = false
  // Lance le vote partagé (le toast + quorum existants prennent le relais).
  if (!hasVotedSkip.value) toggleSkipVote()
}
function hostSkipNow() {
  skipMenuOpen.value = false
  nextTrack()
}
// Referme le menu quand le morceau change (skip exécuté par vote, fin de piste…).
watch(currentTrackId, () => {
  skipMenuOpen.value = false
})

// Vide la file à venir (hôte) : supprime tous les morceaux sauf celui en cours.
function clearUpNext() {
  if (!isHost.value) return
  clearQueue(currentTrackId.value)
}

// Mélange (hôte) : ne concerne que les morceaux à 0 vote (issus des playlists).
// On l'affiche seulement s'il y a au moins 2 morceaux à 0 vote à venir.
const canShuffle = computed(() =>
  isHost.value && upNext.value.filter(t => t.voters.length === 0).length >= 2
)

// Recherche YouTube (débouncée, via la route serveur)
const {
  query: search, results, loading: searching, clear, submit: runSearch,
  popular, loadPopular, loadPlaylist, activePlaylistId, importablePlaylistId,
  recommended, loadRecommended
} = useYoutubeSearch(uid, roomId.value)

// Un membre muté ne peut rien ajouter → inutile de consommer du quota YouTube
// (la recherche est bloquée côté client ; l'ajout est de toute façon refusé serveur).
function submitSearch() {
  if (iAmMuted.value) return
  runSearch()
}

// Repli de la sidebar (desktop ≥ lg uniquement), mémorisé par navigateur.
const PANEL_KEY = 'platine:panelCollapsed'
const panelCollapsed = ref(false)
function togglePanel() {
  panelCollapsed.value = !panelCollapsed.value
  if (import.meta.client) localStorage.setItem(PANEL_KEY, panelCollapsed.value ? '1' : '0')
}
// Depuis le mini-rail replié : rouvre le panneau directement sur un onglet.
function openPanelTab(tab: 'queue' | 'search' | 'members') {
  panelTab.value = tab
  panelCollapsed.value = false
  if (import.meta.client) localStorage.setItem(PANEL_KEY, '0')
}

// Le mini-rail n'apparaît qu'UNE FOIS le panneau sorti (≈ durée du slide, 300ms)
// pour éviter qu'il se superpose à l'animation. À la ré-ouverture, il part tout
// de suite (le panneau revient par-dessus).
const railVisible = ref(false)
let railTimer: ReturnType<typeof setTimeout> | null = null
watch(panelCollapsed, (collapsed) => {
  if (railTimer) {
    clearTimeout(railTimer)
    railTimer = null
  }
  if (collapsed) {
    railTimer = setTimeout(() => {
      railVisible.value = true
    }, 320)
  } else {
    railVisible.value = false
  }
})

// Préchargement dès l'arrivée dans la room (0 quota) → pas d'effet "pop-in"
// quand on ouvre l'onglet recherche pour la première fois.
onMounted(() => {
  if (import.meta.client) panelCollapsed.value = localStorage.getItem(PANEL_KEY) === '1'
  railVisible.value = panelCollapsed.value // pas de slide au 1er rendu → affichage direct
  loadRecommended()
  loadPopular()
})
// À chaque (ré)ouverture de l'onglet recherche, on rafraîchit les populaires
// → le classement reste à jour sans recharger la page.
watch(() => panelTab.value, (tab) => {
  if (tab === 'search') loadPopular()
})

// Nom de la playlist recommandée prévisualisée (affiché au-dessus de l'aperçu).
const activePlaylistLabel = computed(() =>
  recommended.value.find(p => p.id === activePlaylistId.value)?.label ?? ''
)

// videoIds en cours d'ajout → spinner sur la ligne + anti double-clic (l'ajout
// fait un aller-retour serveur, donc il y a un court délai avant que le morceau
// apparaisse dans la file).
const addingIds = ref(new Set<string>())

async function pick(result: { videoId: string, title: string, channel: string, thumbnail: string, duration?: number }) {
  if (iAmMuted.value) return // droit d'ajout retiré par l'hôte (refusé serveur)
  if (addingIds.value.has(result.videoId)) return // déjà en cours
  // On NE vide PAS la recherche : permet d'ajouter plusieurs titres d'affilée
  // (ex. plusieurs morceaux du même artiste) sans retaper.
  addingIds.value.add(result.videoId)
  try {
    const res = await addTrack({
      title: result.title,
      artist: result.channel,
      cover: result.thumbnail,
      source: 'youtube',
      externalId: result.videoId,
      duration: result.duration
    })
    if (res === 'full') {
      importMsg.value = t('panel.queueFull')
      setTimeout(() => (importMsg.value = ''), 2500)
    }
  } finally {
    addingIds.value.delete(result.videoId)
  }
}

// Import d'une playlist YouTube (jusqu'à 100 morceaux, 0 vote = fallback).
// Cible : URL collée OU chip de playlist curée prévisualisée.
const importing = ref(false)
const importMsg = ref('')
async function importPlaylist() {
  if (iAmMuted.value) return // droit d'ajout retiré par l'hôte
  const id = importablePlaylistId.value
  if (!id || importing.value) return
  importing.value = true
  importMsg.value = ''
  try {
    const list = await $fetch<{ videoId: string, title: string, channel: string, thumbnail: string, duration?: number }[]>(
      '/api/playlist', { query: { id, uid, roomId: roomId.value } }
    )
    const added = await addMany(list.map(r => ({
      title: r.title,
      artist: r.channel,
      cover: r.thumbnail,
      source: 'youtube' as const,
      externalId: r.videoId,
      duration: r.duration
    })))
    importMsg.value = added > 0 ? t('panel.imported', { count: added }) : t('panel.alreadyQueued')
    clear()
  } catch {
    importMsg.value = t('panel.importError')
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

// Mode TV : affichage d'ambiance plein écran (overlay). Le 3D est coupé pendant
// ce temps → une TV (qui rame avec la 3D) reste fluide ; l'audio continue.
// Entrée DIRECTE via ?tv dans l'URL : `tvMode` est vrai dès le 1er rendu (SSR
// inclus) → la scène 3D n'est jamais montée. On mémorise aussi le dernier choix
// par appareil : une fois qu'une TV est passée en mode TV, elle rouvre toujours
// ainsi (sans avoir à viser le bouton à travers le lag).
const TV_KEY = 'platine:tv'
const tvMode = ref(route.query.tv !== undefined)
onMounted(() => {
  if (!tvMode.value && localStorage.getItem(TV_KEY) === '1') tvMode.value = true
  // Persiste l'état initial (cas ?tv direct) ; les changements suivants via le watch.
  localStorage.setItem(TV_KEY, tvMode.value ? '1' : '0')
})
watch(tvMode, (on) => {
  if (import.meta.client) localStorage.setItem(TV_KEY, on ? '1' : '0')
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
        {{ t('room.notFoundTitle') }}
      </h1>
      <p class="mt-2 text-white/55">
        {{ t('room.notFoundText') }}
      </p>
      <NuxtLink
        to="/"
        class="mt-6 inline-block rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-6 py-3 font-semibold"
      >
        {{ t('room.backHome') }}
      </NuxtLink>
    </div>
  </div>

  <div
    v-else
    class="relative h-dvh w-full overflow-hidden bg-[#050506] text-white"
  >
    <!-- Scène 3D plein écran (coupée en mode TV pour économiser le GPU) -->
    <TresCanvas
      v-if="!tvMode"
      :clear-color="darkMutedHex"
      render-mode="always"
      :dpr="[1, 2]"
      class="absolute inset-0"
    >
      <TresPerspectiveCamera
        ref="cameraRef"
        :position="[0, 1.5, 6.8]"
        :fov="45"
      />

      <ThreeSceneEnvironment />
      <ThreeLiquidBackground :palette="palette" />
      <!-- Léger décalage vers le haut pour mieux centrer le disque à l'écran -->
      <TresGroup :position="[0, 0.35, 0]">
        <ThreeVinylRecord
          :cover-src="coverSrc"
          :accent="vibrantHex"
          :speed="0.4"
          :playing="playing && !!nowPlaying"
        />
      </TresGroup>

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
    <header class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 md:p-8 lg:items-center">
      <!-- Wordmark "Platine" centré (même typo + dégradé que la home) -->
      <p
        class="pointer-events-auto absolute left-1/2 top-5 -translate-x-1/2 bg-gradient-to-br from-white via-fuchsia-200 to-cyan-200 bg-clip-text font-[Gyanko] text-2xl tracking-[0.05em] text-transparent md:top-8 md:text-3xl"
      >
        PLATINE
      </p>

      <div class="pointer-events-auto flex items-center gap-3">
        <NuxtLink
          to="/"
          class="grid size-10 place-items-center rounded-full border border-white/15 bg-white/10 backdrop-blur-xl transition hover:bg-white/20"
          :aria-label="t('room.home')"
        >
          <UIcon
            name="i-lucide-arrow-left"
            class="size-5"
          />
        </NuxtLink>

        <!-- Code room + mode : inline à gauche sur DESKTOP uniquement (lg+).
             Sur mobile/tablette portrait, le code passe dans la pile sous FR. -->
        <div class="hidden items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur-xl lg:flex">
          <UIcon
            name="i-lucide-lock"
            class="size-3.5 text-white/60"
          />
          <span class="text-sm font-semibold tracking-[0.2em]">{{ roomId }}</span>
          <span class="text-xs text-white/45">{{ t('room.private') }}</span>
        </div>

        <!-- Mode d'écoute (desktop uniquement) -->
        <div class="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-xl lg:flex">
          <UIcon
            :name="mode === 'speaker' ? 'i-lucide-volume-2' : 'i-lucide-laptop'"
            class="size-4 text-white/70"
          />
          <span class="text-xs text-white/60">
            {{ mode === 'speaker' ? t('room.modeSpeaker') : t('room.modeEach') }}
          </span>
        </div>
      </div>

      <div class="pointer-events-auto flex flex-col items-end gap-2">
        <!-- Ligne du haut : FR/EN + Inviter (icône seule < lg, avec texte sur desktop) -->
        <div class="flex items-center gap-2">
          <LangSwitch />
          <button
            class="flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90 lg:px-4"
            :style="{ backgroundColor: vibrantHex }"
            :aria-label="t('room.invite')"
            @click="copyLink"
          >
            <UIcon
              :name="copied ? 'i-lucide-check' : 'i-lucide-link'"
              class="size-4"
            />
            <span class="hidden lg:inline">{{ copied ? t('room.linkCopied') : t('room.invite') }}</span>
          </button>
        </div>

        <!-- Sous FR/EN (mobile + tablette portrait uniquement) : code room -->
        <div class="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur-xl lg:hidden">
          <UIcon
            name="i-lucide-lock"
            class="size-3.5 text-white/60"
          />
          <span class="text-sm font-semibold tracking-[0.2em]">{{ roomId }}</span>
          <span class="text-xs text-white/45">{{ t('room.private') }}</span>
        </div>
      </div>
    </header>

    <!-- ───────── Player du morceau en lecture ───────── -->
    <YoutubePlayer
      v-if="nowPlaying"
      ref="playerRef"
      :video-id="nowPlaying.externalId"
      :title="nowPlaying.title"
      :artist="nowPlaying.artist"
      :muted="muted"
      :playing="playing"
      :volume="volume"
      @ended="onTrackEnded"
      @progress="onProgress"
      @playstate="onPlayerState"
    />

    <!-- ───────── Toast de vote pour skip (partagé, tous) ───────── -->
    <Transition name="skip-toast">
      <div
        v-if="skipActive && nowPlaying"
        class="pointer-events-auto absolute left-1/2 top-20 z-40 w-[320px] max-w-[90vw] -translate-x-1/2 rounded-2xl border border-white/15 bg-black/80 p-4 shadow-2xl backdrop-blur-2xl md:top-24"
      >
        <div class="flex items-center gap-2">
          <span
            class="size-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: lastVoterColor }"
          />
          <p class="min-w-0 flex-1 truncate text-sm font-medium text-white">
            {{ t('room.skipToastTitle', { name: lastVoterName || '—' }) }}
          </p>
          <span class="shrink-0 text-xs tabular-nums text-white/50">{{ skipCount }}/{{ quorum }}</span>
        </div>

        <!-- Barre de progression du vote -->
        <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
          <div
            class="h-full rounded-full bg-fuchsia-400 transition-[width] duration-300"
            :style="{ width: `${Math.min(100, (skipCount / quorum) * 100)}%` }"
          />
        </div>

        <!-- Bouton voter / annuler (invité uniquement) -->
        <button
          v-if="!isHost"
          class="mt-3 w-full cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold transition"
          :class="hasVotedSkip
            ? 'bg-white/10 text-white/70 hover:bg-white/20'
            : 'bg-fuchsia-500 text-white hover:bg-fuchsia-400'"
          @click="toggleSkipVote"
        >
          {{ hasVotedSkip ? t('room.skipVotedBtn') : t('room.skipVoteBtn') }}
        </button>
      </div>
    </Transition>

    <!-- ───────── Timeline classique + contrôles ───────── -->
    <div
      v-if="nowPlaying"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 pb-28 lg:pb-5"
    >
      <!-- Titre centré sous le disque (mobile + tablette portrait uniquement ;
           sur desktop le titre est dans la vignette en haut à gauche). -->
      <div class="pointer-events-auto w-full max-w-xs px-5 text-center lg:hidden">
        <!-- Bouton de déblocage du son si l'autoplay est bloqué -->
        <button
          v-if="playerRef?.needsGesture"
          class="mb-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-xl transition hover:bg-white/25"
          @click="playerRef?.resume()"
        >
          <UIcon
            name="i-lucide-volume-2"
            class="size-4"
          />
          {{ t('room.joinListen') }}
        </button>
        <MarqueeText
          :text="nowPlaying.title"
          class="font-semibold text-white"
        />
        <p class="truncate text-sm text-white/55">
          {{ nowPlaying.artist || '—' }}
        </p>
      </div>

      <!-- Barre de progression (1/3 de l'écran, centrée) -->
      <div class="pointer-events-auto w-full max-w-md px-5">
        <!-- Zone cliquable élargie (padding vertical) pour viser facilement la
             barre ; la piste visible reste fine à l'intérieur. -->
        <div
          ref="trackRef"
          class="group relative -my-3 py-3"
          :class="isHost ? 'cursor-pointer' : ''"
          @click="onTrackClick"
        >
          <!-- Piste : fond gris translucide, remplissage blanc -->
          <div class="relative h-1.5 w-full rounded-full bg-white/15 transition-all group-hover:h-2.5">
            <div
              class="absolute inset-y-0 left-0 rounded-full bg-white"
              :style="{ width: `${progress * 100}%` }"
            />
            <!-- Curseur (handle) à la tête de lecture -->
            <div
              v-if="isHost"
              class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
              :style="{ left: `${progress * 100}%` }"
            />
          </div>
        </div>
        <!-- Temps : actuel à gauche, total à droite -->
        <div class="mt-1.5 flex justify-between text-[11px] tabular-nums text-white/50">
          <span>{{ fmt(current) }}</span>
          <span>{{ fmt(duration) }}</span>
        </div>
      </div>

      <!-- Contrôles centrés -->
      <div class="pointer-events-auto flex items-center gap-4">
        <!-- Volume LOCAL (ce navigateur uniquement) — masqué si pas de son -->
        <div
          v-if="!muted"
          class="group relative"
        >
          <button
            class="grid size-11 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20"
            :aria-label="t('room.volume')"
            @click="toggleMuteLocal"
          >
            <UIcon
              :name="volIcon"
              class="size-5"
            />
          </button>
          <!-- Slider (apparaît au survol ; pb-2 fait le pont sans coupure) -->
          <div class="absolute bottom-full left-1/2 hidden -translate-x-1/2 pb-2 group-hover:block">
            <div class="flex items-center gap-2 rounded-xl border border-white/15 bg-black/80 px-3 py-2 backdrop-blur-xl">
              <input
                v-model.number="volume"
                type="range"
                min="0"
                max="100"
                step="1"
                class="h-1 w-28 cursor-pointer accent-white"
                :aria-label="t('room.volume')"
              >
              <span class="w-8 shrink-0 text-right text-xs tabular-nums text-white/60">{{ volume }}</span>
            </div>
          </div>
        </div>

        <!-- Plein écran du clip (pour tout le monde) -->
        <button
          class="grid size-11 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20"
          :aria-label="t('room.fullscreen')"
          @click="playerRef?.enterFullscreen()"
        >
          <UIcon
            name="i-lucide-expand"
            class="size-5"
          />
        </button>

        <!-- Mode TV (pour tout le monde) : affichage d'ambiance plein écran.
             Bouton simple + focusable au D-pad (anneau de focus visible) pour
             être atteignable à la télécommande d'une TV. -->
        <button
          class="grid size-11 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          :aria-label="t('room.tvMode')"
          @click="tvMode = true"
        >
          <UIcon
            name="i-lucide-tv"
            class="size-5"
          />
        </button>

        <!-- Pause/play + morceau suivant : hôte uniquement -->
        <template v-if="isHost">
          <button
            class="grid size-12 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20"
            :aria-label="playing ? t('room.pause') : t('room.play')"
            @click="togglePlaying"
          >
            <UIcon
              :name="playing ? 'i-lucide-pause' : 'i-lucide-play'"
              class="size-6"
            />
          </button>
          <!-- Skip hôte : le clic ouvre deux choix en diagonale (proposer un
               vote / passer direct), avec un voile sombre qui estompe la
               timeline derrière. Clic ailleurs = referme. -->
          <div class="relative">
            <!-- Clic hors menu → referme -->
            <div
              v-if="skipMenuOpen"
              class="pointer-events-auto fixed inset-0 z-[1] cursor-default"
              @click="skipMenuOpen = false"
            />
            <!-- Dôme sombre : part du bas de l'écran et englobe les 3 boutons -->
            <div
              v-if="skipMenuOpen"
              class="skip-scrim pointer-events-none absolute -bottom-12 left-1/2 z-[2] h-72 w-[32rem] -translate-x-1/2"
            />
            <!-- Choix : proposer un vote (diagonale haut gauche) -->
            <div
              v-if="skipMenuOpen"
              class="group/skl skip-choice-in absolute -left-14 -top-12 z-[3]"
            >
              <button
                class="grid size-11 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20"
                :aria-label="t('room.proposeSkip')"
                @click="hostProposeSkip"
              >
                <UIcon
                  name="i-lucide-megaphone"
                  class="size-5"
                />
              </button>
              <span class="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 backdrop-blur-xl transition group-hover/skl:opacity-100">
                {{ t('room.proposeSkip') }}
              </span>
            </div>
            <!-- Choix : passer directement (diagonale haut droite) -->
            <div
              v-if="skipMenuOpen"
              class="group/skr skip-choice-in absolute -right-14 -top-12 z-[3]"
            >
              <button
                class="grid size-11 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20"
                :aria-label="t('room.skipNow')"
                @click="hostSkipNow"
              >
                <UIcon
                  name="i-lucide-skip-forward"
                  class="size-5"
                />
              </button>
              <span class="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 backdrop-blur-xl transition group-hover/skr:opacity-100">
                {{ t('room.skipNow') }}
              </span>
            </div>
            <!-- Bouton skip principal : ouvre le menu, devient un X (fermer)
                 quand il est ouvert (évite le doublon avec le choix skip). -->
            <button
              class="relative z-[3] grid size-11 cursor-pointer place-items-center rounded-full border border-white/15 text-white backdrop-blur-xl transition"
              :class="skipMenuOpen ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'"
              :aria-label="skipMenuOpen ? t('room.closeSkipMenu') : t('room.next')"
              :aria-expanded="skipMenuOpen"
              @click="skipMenuOpen = !skipMenuOpen"
            >
              <UIcon
                :name="skipMenuOpen ? 'i-lucide-x' : 'i-lucide-skip-forward'"
                class="size-5"
              />
            </button>
          </div>
        </template>

        <!-- Invité : vote pour skip (toggle), pophover au survol -->
        <div
          v-else
          class="group relative"
        >
          <button
            class="grid size-11 cursor-pointer place-items-center rounded-full border transition"
            :class="hasVotedSkip
              ? 'border-fuchsia-400/60 bg-fuchsia-500/30 text-white'
              : 'border-white/15 bg-white/10 text-white hover:bg-white/20'"
            :aria-label="t('room.voteSkip')"
            @click="toggleSkipVote"
          >
            <UIcon
              name="i-lucide-skip-forward"
              class="size-5"
            />
          </button>
          <!-- Pophover -->
          <span class="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/80 px-2.5 py-1 text-xs font-medium text-white opacity-0 backdrop-blur-xl transition group-hover:opacity-100">
            {{ t('room.voteSkip') }}
          </span>
        </div>
      </div>
    </div>

    <!-- ───────── Emotes / réactions (temps réel) ───────── -->
    <!-- Voile de fermeture du sélecteur (clic à l'extérieur) -->
    <div
      v-if="emotePickerOpen"
      class="fixed inset-0 z-20"
      @click="emotePickerOpen = false"
    />
    <!-- Barre des emotes récentes (bas gauche) + bouton « … » (tous les emojis) -->
    <div class="pointer-events-auto absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-white/15 bg-black/40 p-1.5 backdrop-blur-xl md:bottom-28 md:left-8 md:top-auto md:translate-y-0 md:flex-row lg:bottom-8">
      <button
        v-for="e in recentEmotes"
        :key="e.code"
        class="grid size-9 cursor-pointer place-items-center rounded-full transition hover:bg-white/15 active:scale-90"
        :aria-label="e.label"
        @click="react(e.code, e.char)"
      >
        <img
          :src="twemojiUrl(e.code)"
          :alt="e.char"
          class="size-5 select-none"
          draggable="false"
        >
      </button>

      <!-- Bouton « … » : ouvre le sélecteur emoji-mart (tous les emojis) au-dessus -->
      <button
        class="grid size-9 cursor-pointer place-items-center rounded-full text-white/60 transition hover:bg-white/15 hover:text-white active:scale-90"
        :aria-label="t('room.moreEmotes')"
        :aria-expanded="emotePickerOpen"
        @click="emotePickerOpen = !emotePickerOpen"
      >
        <UIcon
          name="i-lucide-ellipsis"
          class="size-5"
        />
      </button>
    </div>

    <!-- Sélecteur emoji-mart (chargé à la demande). PLACÉ HORS de la barre : la
         barre a un backdrop-filter qui « capturerait » un position:fixed. Ancré
         en bas à gauche (au-dessus de la barre), largeur/hauteur bornées au
         viewport → ne déborde jamais (mobile comme desktop). -->
    <EmojiPicker
      v-if="emotePickerOpen"
      class="fixed bottom-24 left-2 z-[60] h-[min(70vh,28rem)] w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl md:left-8 md:bottom-44 lg:bottom-24"
      @select="onPickerSelect"
    />

    <!-- Overlay des emotes flottantes (fade-in par le bas + rotation aléatoire) -->
    <div class="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <img
        v-for="e in emotes"
        :key="e.id"
        :src="twemojiUrl(e.code)"
        alt=""
        class="emote-float absolute bottom-28 size-12 select-none md:size-16"
        :style="{ 'left': `${e.left}%`, '--rot': `${e.rot}deg` }"
      >
    </div>

    <!-- ───────── Panneau file d'attente ───────── -->
    <!-- pointer-events-none sur l'aside : sa zone transparente (haut, en
         desktop md:inset-y-0) ne doit pas intercepter les clics du header.
         Le panneau interne réactive les events. -->
    <aside
      ref="sheetRef"
      class="pointer-events-auto fixed inset-x-0 bottom-0 z-30 h-[85dvh] px-2 lg:pointer-events-none lg:absolute lg:inset-y-0 lg:right-0 lg:bottom-auto lg:left-auto lg:flex lg:h-full lg:w-96 lg:items-center lg:px-0 lg:pr-6 lg:!translate-y-0"
      :class="sheetDrag === null
        ? ['transition-transform duration-300 ease-out', sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-96px)]', panelCollapsed ? 'panel-collapsed-lg' : '']
        : ''"
      :style="sheetDrag !== null ? { transform: `translateY(${sheetDrag}px)`, transition: 'none' } : undefined"
    >
      <div class="pointer-events-auto relative flex h-full w-full flex-col rounded-t-3xl border border-white/15 border-b-0 bg-black/40 p-4 backdrop-blur-2xl lg:h-[80dvh] lg:rounded-3xl lg:border-b lg:bg-black/30 lg:p-5">
        <!-- Poignée de repli (desktop) : colle au bord gauche du panneau -->
        <button
          class="absolute left-0 top-1/2 z-10 hidden h-16 w-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/70 backdrop-blur-xl transition hover:bg-black/80 hover:text-white lg:flex"
          :aria-label="t('panel.collapse')"
          :title="t('panel.collapse')"
          @click="togglePanel"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4"
          />
        </button>

        <!-- Poignée de drag (mobile / tablette portrait uniquement) -->
        <div
          class="mb-3 flex shrink-0 cursor-grab touch-none justify-center lg:hidden"
          @pointerdown="onSheetDown"
        >
          <span class="h-1.5 w-10 rounded-full bg-white/30" />
        </div>

        <!-- Onglets (icônes) : playlist / recherche / membres -->
        <div class="flex items-center gap-1 rounded-xl bg-white/5 p-1">
          <button
            class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 transition"
            :class="panelTab === 'queue' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'"
            :title="t('panel.playlist')"
            :aria-label="t('panel.playlist')"
            @click="panelTab = 'queue'; openSheet()"
          >
            <UIcon
              name="i-lucide-list-music"
              class="size-5"
            />
            <span class="rounded-full bg-white/10 px-1.5 text-xs font-semibold">{{ tracks.length }}</span>
          </button>
          <button
            class="flex flex-1 cursor-pointer items-center justify-center rounded-lg py-2 transition"
            :class="panelTab === 'search' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'"
            :title="t('panel.search')"
            :aria-label="t('panel.search')"
            @click="panelTab = 'search'; openSheet()"
          >
            <UIcon
              name="i-lucide-search"
              class="size-5"
            />
          </button>
          <button
            class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 transition"
            :class="panelTab === 'members' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'"
            :title="t('panel.members')"
            :aria-label="t('panel.members')"
            @click="panelTab = 'members'; openSheet()"
          >
            <UIcon
              name="i-lucide-users"
              class="size-5"
            />
            <span class="rounded-full bg-white/10 px-1.5 text-xs font-semibold">{{ members.length }}</span>
          </button>
        </div>

        <!-- ───── Onglet MEMBRES ───── -->
        <div
          v-if="panelTab === 'members'"
          class="mt-4 flex-1 overflow-y-auto"
        >
          <!-- Hôte : retirer / rendre le droit d'ajouter à TOUS en un clic -->
          <button
            v-if="isHost && otherMembers.length"
            class="mb-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="moderatingAll"
            @click="moderateAll(!allOthersMuted)"
          >
            <UIcon
              :name="moderatingAll ? 'i-lucide-loader-circle' : (allOthersMuted ? 'i-lucide-circle-slash' : 'i-lucide-ban')"
              class="size-4"
              :class="{ 'animate-spin': moderatingAll }"
            />
            {{ allOthersMuted ? t('panel.unmuteAll') : t('panel.muteAll') }}
          </button>
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
                  >{{ t('panel.you') }}</span>
                  <!-- Membre privé du droit d'ajouter (visible par tous) -->
                  <UIcon
                    v-if="m.muted"
                    name="i-lucide-ban"
                    class="ml-1 inline size-3.5 align-text-bottom text-amber-400/80"
                    :title="t('panel.mutedBadge')"
                  />
                </span>
                <button
                  v-if="m.isSelf"
                  class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
                  :aria-label="t('panel.renameAria')"
                  @click="startRename"
                >
                  <UIcon
                    name="i-lucide-pencil"
                    class="size-4"
                  />
                </button>
                <!-- Hôte : retirer / rendre le droit d'ajouter à ce membre -->
                <button
                  v-else-if="isHost"
                  class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition hover:bg-white/10 disabled:cursor-not-allowed"
                  :class="m.muted ? 'text-amber-400 hover:text-amber-300' : 'text-white/40 hover:text-white'"
                  :disabled="moderatingUids.has(m.uid)"
                  :aria-label="m.muted ? t('panel.unmuteAria') : t('panel.muteAria')"
                  :title="m.muted ? t('panel.unmuteAria') : t('panel.muteAria')"
                  @click="toggleMute(m.uid, !m.muted)"
                >
                  <UIcon
                    :name="moderatingUids.has(m.uid) ? 'i-lucide-loader-circle' : (m.muted ? 'i-lucide-circle-slash' : 'i-lucide-ban')"
                    class="size-4"
                    :class="{ 'animate-spin': moderatingUids.has(m.uid) }"
                  />
                </button>
              </template>
            </li>
          </ul>
        </div>

        <!-- ───── Onglet RECHERCHE ───── -->
        <div
          v-show="panelTab === 'search'"
          class="mt-4 flex min-h-0 flex-1 flex-col"
        >
          <!-- Droit d'ajout retiré par l'hôte → recherche/ajout désactivés -->
          <div
            v-if="iAmMuted"
            class="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200"
          >
            <UIcon
              name="i-lucide-ban"
              class="size-4 shrink-0"
            />
            {{ t('panel.mutedNotice') }}
          </div>
          <!-- Barre de recherche -->
          <div
            v-else
            class="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5"
          >
            <UIcon
              :name="searching ? 'i-lucide-loader-circle' : 'i-lucide-search'"
              class="size-4 text-white/40"
              :class="{ 'animate-spin': searching }"
            />
            <input
              v-model="search"
              :placeholder="t('panel.searchPlaceholder')"
              class="w-full bg-transparent text-sm outline-none placeholder:text-white/40"
              @keyup.enter="submitSearch"
            >
            <button
              v-if="search"
              class="text-white/40 transition hover:text-white"
              :aria-label="t('panel.clear')"
              @click="clear"
            >
              <UIcon
                name="i-lucide-x"
                class="size-4"
              />
            </button>
          </div>

          <!-- Aperçu d'une playlist curée → lien retour vers les recommandations -->
          <button
            v-if="activePlaylistId"
            class="mt-2 flex items-center gap-1 text-xs cursor-pointer text-white/50 transition hover:text-white"
            @click="clear"
          >
            <UIcon
              name="i-lucide-chevron-left"
              class="size-4"
            />
            {{ t('panel.backToReco') }}
          </button>

          <!-- Nom de la playlist recommandée prévisualisée -->
          <p
            v-if="activePlaylistLabel"
            class="mt-1 flex items-center gap-2 text-sm font-semibold text-white"
          >
            <UIcon
              name="i-lucide-list-music"
              class="size-4 shrink-0 text-white/60"
            />
            {{ activePlaylistLabel }}
          </p>

          <!-- URL de playlist OU chip curée → bouton d'import (max 100, 0 vote) -->
          <button
            v-if="importablePlaylistId"
            class="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium text-white/90 transition hover:brightness-150 disabled:cursor-not-allowed disabled:opacity-60"
            :style="{ borderColor: vibrantHex + '40', backgroundColor: vibrantHex + '14' }"
            :disabled="importing"
            @click="importPlaylist"
          >
            <UIcon
              :name="importing ? 'i-lucide-loader-circle' : 'i-lucide-list-plus'"
              class="size-4"
              :class="{ 'animate-spin': importing }"
            />
            {{ importing ? t('panel.importing') : t('panel.importPlaylist') }}
          </button>
          <p
            v-if="importMsg"
            class="mt-2 text-center text-xs text-white/60"
          >
            {{ importMsg }}
          </p>

          <!-- Résultats : grande liste scrollable qui remplit le panneau -->
          <ul
            v-if="results.length"
            class="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto"
          >
            <li
              v-for="r in results"
              :key="r.videoId"
            >
              <button
                class="group flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left transition hover:bg-white/10 disabled:cursor-default disabled:opacity-60"
                :disabled="addingIds.has(r.videoId)"
                @click="pick(r)"
              >
                <img
                  :src="r.thumbnail"
                  alt=""
                  class="h-11 w-11 shrink-0 rounded object-cover"
                >
                <span class="min-w-0 flex-1">
                  <MarqueeText
                    :text="r.title"
                    class="text-sm font-medium"
                  />
                  <span class="block truncate text-xs text-white/50">{{ r.channel }}<template v-if="fmtDuration(r.duration ?? null)"> · {{ fmtDuration(r.duration ?? null) }}</template></span>
                </span>
                <!-- En cours d'ajout → spinner (anti double-clic) -->
                <UIcon
                  v-if="addingIds.has(r.videoId)"
                  name="i-lucide-loader-circle"
                  class="size-5 shrink-0 animate-spin text-white/60"
                />
                <!-- Déjà dans la file → on propose un vote, pas un doublon -->
                <span
                  v-else-if="isQueued('youtube', r.videoId)"
                  class="group/vote relative shrink-0"
                >
                  <UIcon
                    name="i-lucide-arrow-big-up"
                    class="size-5 cursor-pointer text-fuchsia-400"
                  />
                  <span class="pointer-events-none absolute right-full top-1/2 z-10 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-black/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 backdrop-blur-xl transition group-hover/vote:opacity-100">
                    {{ t('panel.voteHint') }}
                  </span>
                </span>
                <UIcon
                  v-else
                  name="i-lucide-plus"
                  class="size-5 shrink-0 text-white/40"
                />
              </button>
            </li>
          </ul>

          <!-- Recherche tapée mais sans résultat -->
          <div
            v-else-if="search"
            class="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center"
          >
            <UIcon
              name="i-lucide-search"
              class="size-8 text-white/25"
            />
            <p class="text-sm text-white/45">
              {{ t('panel.searchEmpty') }}
            </p>
          </div>

          <!-- Aucune recherche → recommandations (playlists curées + populaires) -->
          <div
            v-else
            class="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto"
          >
            <!-- Playlists curées -->
            <section v-if="recommended.length">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
                {{ t('panel.recoPlaylists') }}
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="p in recommended"
                  :key="p.id"
                  class="cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                  @click="loadPlaylist(p.id)"
                >
                  {{ p.label }}
                </button>
              </div>
            </section>

            <!-- Morceaux les plus ajoutés -->
            <section v-if="popular.length">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
                {{ t('panel.recoPopular') }}
              </p>
              <ul class="space-y-1">
                <li
                  v-for="r in popular"
                  :key="r.videoId"
                >
                  <button
                    class="group flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left transition hover:bg-white/10 disabled:cursor-default disabled:opacity-60"
                    :disabled="addingIds.has(r.videoId)"
                    @click="pick(r)"
                  >
                    <img
                      :src="r.thumbnail"
                      alt=""
                      class="h-11 w-11 shrink-0 rounded object-cover"
                    >
                    <span class="min-w-0 flex-1">
                      <MarqueeText
                        :text="r.title"
                        class="text-sm font-medium"
                      />
                      <span class="block truncate text-xs text-white/50">{{ r.channel }}<template v-if="fmtDuration(r.duration ?? null)"> · {{ fmtDuration(r.duration ?? null) }}</template></span>
                    </span>
                    <UIcon
                      v-if="addingIds.has(r.videoId)"
                      name="i-lucide-loader-circle"
                      class="size-5 shrink-0 animate-spin text-white/60"
                    />
                    <span
                      v-else-if="isQueued('youtube', r.videoId)"
                      class="group/vote relative shrink-0"
                    >
                      <UIcon
                        name="i-lucide-arrow-big-up"
                        class="size-5 cursor-pointer text-fuchsia-400"
                      />
                      <span class="pointer-events-none absolute right-full top-1/2 z-10 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-black/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 backdrop-blur-xl transition group-hover/vote:opacity-100">
                        {{ t('panel.voteHint') }}
                      </span>
                    </span>
                    <UIcon
                      v-else
                      name="i-lucide-plus"
                      class="size-5 shrink-0 text-white/40"
                    />
                  </button>
                </li>
              </ul>
            </section>

            <!-- Rien à recommander encore → aide simple -->
            <div
              v-if="!recommended.length && !popular.length"
              class="flex flex-col items-center justify-center gap-2 py-10 text-center"
            >
              <UIcon
                name="i-lucide-search"
                class="size-8 text-white/25"
              />
              <p class="text-sm text-white/45">
                {{ t('panel.searchHint') }}
              </p>
            </div>
          </div>
        </div>

        <!-- En-tête file : temps total (si dispo) + toggle autoplay (hôte) -->
        <div
          v-if="panelTab === 'queue'"
          class="mt-3 flex min-h-7 items-center justify-between gap-2"
        >
          <span class="text-xs text-white/40">
            <template v-if="nowPlaying || upNext.length">
              {{ sorted.length }} {{ sorted.length > 1 ? t('panel.tracksCountPlural') : t('panel.tracksCount') }}<template v-if="totalDurationLabel"> · {{ totalDurationLabel }}</template>
            </template>
          </span>
          <button
            v-if="isHost"
            class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition"
            :class="autoplay ? 'bg-fuchsia-500/20 text-fuchsia-200' : 'text-white/45 hover:bg-white/10 hover:text-white/80'"
            :aria-pressed="autoplay"
            :title="t('panel.autoplayHint')"
            @click="setAutoplay(!autoplay)"
          >
            <UIcon
              name="i-lucide-infinity"
              class="size-3.5"
            />
            {{ t('panel.autoplay') }}
          </button>
        </div>

        <!-- État vide (rien en lecture ni à venir) -->
        <div
          v-if="panelTab === 'queue' && !nowPlaying && upNext.length === 0"
          class="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center"
        >
          <UIcon
            name="i-lucide-music"
            class="size-8 text-white/25"
          />
          <p class="text-sm text-white/45">
            {{ t('panel.emptyTitle') }}<br>
            {{ t('panel.emptySubtitle') }}
          </p>
        </div>

        <!-- Playlist : morceau en cours en tête (couleur marquée, sans vote),
             puis la file à venir triée par votes -->
        <ul
          v-else-if="panelTab === 'queue'"
          class="mt-3 flex-1 space-y-2 overflow-y-auto"
        >
          <!-- Morceau en lecture -->
          <li
            v-if="nowPlaying"
            class="now-playing group flex items-center gap-3 rounded-xl bg-white/5 p-2.5 ring-1 ring-white/15 transition"
            :style="{ backgroundImage: `linear-gradient(to right, ${colorFor(nowPlaying.addedBy)}b3 0%, transparent 45%)` }"
          >
            <UIcon
              name="i-lucide-volume-2"
              class="size-4 shrink-0 text-white/80"
            />
            <div class="min-w-0 flex-1">
              <MarqueeText
                :text="nowPlaying.title"
                class="text-sm font-medium"
              />
              <p class="truncate text-xs text-white/50">
                {{ nowPlaying.artist || '—' }}<template v-if="fmtDuration(nowPlaying.duration)">
                  · {{ fmtDuration(nowPlaying.duration) }}
                </template>
              </p>
            </div>
            <span class="shrink-0 text-xs font-medium text-white/50">{{ t('panel.nowPlaying') }}</span>
            <!-- Retirer (auteur ou hôte) -->
            <button
              v-if="nowPlaying.addedBy === uid || isHost"
              class="shrink-0 cursor-pointer text-white/30 transition hover:text-white/80"
              :aria-label="t('panel.remove')"
              @click="removeTrack(nowPlaying.id)"
            >
              <UIcon
                name="i-lucide-x"
                class="size-4"
              />
            </button>
          </li>

          <!-- Actions hôte sur la file à venir : mélanger (0-vote) + vider -->
          <li
            v-if="isHost && upNext.length"
            class="flex items-center justify-end gap-1"
          >
            <button
              v-if="canShuffle"
              class="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-white/45 transition hover:bg-white/10 hover:text-white/80"
              @click="reshuffle"
            >
              <UIcon
                name="i-lucide-shuffle"
                class="size-3.5"
              />
              {{ t('panel.shuffle') }}
            </button>
            <button
              class="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-white/45 transition hover:bg-white/10 hover:text-white/80"
              @click="clearUpNext"
            >
              <UIcon
                name="i-lucide-list-x"
                class="size-3.5"
              />
              {{ t('panel.clearQueue') }}
            </button>
          </li>

          <!-- File à venir -->
          <li
            v-for="(track, i) in upNext"
            :key="track.id"
            class="group flex items-center gap-3 rounded-xl bg-white/5 p-2.5 transition"
            :style="{ backgroundImage: `linear-gradient(to right, ${colorFor(track.addedBy)}66 0%, transparent 25%)` }"
          >
            <span class="w-4 shrink-0 text-center text-sm text-white/40">{{ i + 1 }}</span>
            <div class="min-w-0 flex-1">
              <MarqueeText
                :text="track.title"
                class="text-sm font-medium"
              />
              <p class="truncate text-xs text-white/50">
                {{ track.artist || '—' }}<template v-if="fmtDuration(track.duration)">
                  · {{ fmtDuration(track.duration) }}
                </template>
              </p>
            </div>

            <!-- Vote -->
            <button
              class="flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold transition"
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
              class="shrink-0 cursor-pointer text-white/30 transition hover:text-white/80"
              :aria-label="t('panel.remove')"
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
          {{ isHost ? t('panel.isHost') : t('panel.isGuest') }}
        </p>
      </div>
    </aside>

    <!-- Mini-rail de ré-ouverture (desktop) : collé au bord droit quand replié.
         Apparaît une fois le panneau sorti (railVisible, ≈300ms), avec un léger
         fondu. Indicateurs cliquables → rouvrent le panneau sur l'onglet voulu. -->
    <div
      v-if="railVisible"
      class="panel-rail-in fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-stretch gap-1 rounded-l-2xl border border-r-0 border-white/15 bg-black/50 p-1.5 backdrop-blur-xl lg:flex"
    >
      <!-- Rouvrir (onglet courant) -->
      <button
        class="grid size-9 cursor-pointer place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white"
        :aria-label="t('panel.expand')"
        :title="t('panel.expand')"
        @click="togglePanel"
      >
        <UIcon
          name="i-lucide-chevron-left"
          class="size-5"
        />
      </button>
      <span class="mx-1 h-px bg-white/10" />
      <!-- File : nombre de morceaux -->
      <button
        class="flex cursor-pointer flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
        :aria-label="t('panel.playlist')"
        :title="t('panel.playlist')"
        @click="openPanelTab('queue')"
      >
        <UIcon
          name="i-lucide-list-music"
          class="size-5"
        />
        <span class="text-[10px] font-semibold tabular-nums">{{ tracks.length }}</span>
      </button>
      <!-- Membres : nombre de personnes -->
      <button
        class="flex cursor-pointer flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
        :aria-label="t('panel.members')"
        :title="t('panel.members')"
        @click="openPanelTab('members')"
      >
        <UIcon
          name="i-lucide-users"
          class="size-5"
        />
        <span class="text-[10px] font-semibold tabular-nums">{{ members.length }}</span>
      </button>
      <!-- Recherche -->
      <button
        class="grid size-9 cursor-pointer place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white"
        :aria-label="t('panel.search')"
        :title="t('panel.search')"
        @click="openPanelTab('search')"
      >
        <UIcon
          name="i-lucide-search"
          class="size-5"
        />
      </button>
    </div>

    <!-- ───────── Mode TV (overlay d'ambiance plein écran) ───────── -->
    <TvMode
      v-if="tvMode"
      :track-id="nowPlaying?.id ?? ''"
      :cover="coverSrc"
      :title="nowPlaying?.title ?? ''"
      :artist="nowPlaying?.artist ?? ''"
      :up-next="upNext"
      :playing="playing"
      :progress="progress"
      :current="current"
      :duration="duration"
      :is-host="isHost"
      :accent="vibrantHex"
      :bg="darkMutedHex"
      @exit="tvMode = false"
      @seek="onSeekRatio"
    />

    <!-- Annonce admin (« god mode ») : overlay plein écran qui assombrit tout,
         ~4,5 s puis fondu. Message envoyé par l'admin (infalsifiable, cf. table
         announcements RLS). -->
    <Transition name="announce">
      <div
        v-if="announcement"
        class="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-8 backdrop-blur-md"
      >
        <p class="max-w-3xl text-center text-2xl font-bold leading-snug text-white md:text-4xl">
          {{ announcement }}
        </p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Annonce admin : fondu + léger zoom à l'entrée/sortie. */
.announce-enter-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.announce-leave-active {
  transition: opacity 0.6s ease;
}
.announce-enter-from {
  opacity: 0;
  transform: scale(1.04);
}
.announce-leave-to {
  opacity: 0;
}

/* Repli de la sidebar (desktop ≥ lg). On utilise `transform` (et non les
   utilitaires translate de Tailwind v4, qui passent par la propriété
   `translate` et entrent en conflit avec lg:!translate-y-0). Animé par
   `transition-transform` déjà présent sur l'aside. */
@media (min-width: 1024px) {
  .panel-collapsed-lg {
    transform: translateX(110%);
  }
}
/* Dôme sombre du menu skip : demi-cercle qui monte du bas de l'écran et
   englobe les 3 boutons (dégradé radial centré sur le bord inférieur,
   bords doux). Déborde sous le bouton (-bottom) pour toucher le bas. */
.skip-scrim {
  background: radial-gradient(
    ellipse 50% 100% at 50% 100%,
    rgba(0, 0, 0, 0.8) 0%,
    rgba(0, 0, 0, 0.6) 55%,
    rgba(0, 0, 0, 0) 78%
  );
  animation: skip-scrim-in 200ms ease-out;
}
@keyframes skip-scrim-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Apparition des choix du menu skip hôte (pop scale + fondu). */
.skip-choice-in {
  animation: skip-choice-in 160ms ease-out;
}
@keyframes skip-choice-in {
  from {
    opacity: 0;
    scale: 0.6;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}

/* Fondu d'apparition du mini-rail (déclenché à son montage, une fois le
   panneau sorti — cf. railVisible décalé de ~300ms). */
.panel-rail-in {
  animation: panel-rail-in 200ms ease-out;
}
@keyframes panel-rail-in {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Morceau en cours : le dégradé "respire" doucement (va-et-vient + pulse)
   pour marquer qu'il est vivant, sans distraire. */
.now-playing {
  background-size: 160% 100%;
  animation: now-playing-breathe 3.2s ease-in-out infinite;
}
@keyframes now-playing-breathe {
  0%, 100% {
    background-position: 0% 0;
    opacity: 0.92;
  }
  50% {
    background-position: 18% 0;
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .now-playing {
    animation: none;
  }
}

/* Apparition/disparition du toast de vote skip */
.skip-toast-enter-active,
.skip-toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.skip-toast-enter-from,
.skip-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}

/* Emotes flottantes : apparition par le bas, rotation figée (--rot),
   puis disparition vers le haut. Style réactions Meet/Teams. */
.emote-float {
  animation: emote-float 1.1s ease-out forwards;
  will-change: transform, opacity;
}
@keyframes emote-float {
  0% {
    opacity: 0;
    transform: translateY(40px) rotate(var(--rot, 0deg)) scale(0.6);
  }
  15% {
    opacity: 1;
    transform: translateY(0) rotate(var(--rot, 0deg)) scale(1);
  }
  70% {
    opacity: 1;
    transform: translateY(-32px) rotate(var(--rot, 0deg)) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-96px) rotate(var(--rot, 0deg)) scale(0.9);
  }
}
</style>
