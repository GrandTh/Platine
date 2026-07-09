<script setup lang="ts">
/**
 * Dashboard admin (lecture seule) : barre de stats globales, liste des rooms
 * actives (recherche + tri) à gauche, détail de la room sélectionnée + top
 * morceaux à droite. Données via /api/admin/* (protégés par requireAdmin).
 * Mises à jour en **temps réel** (Realtime Supabase) + poll de secours.
 */
import type { AdminRateLimit, AdminRoom, AdminRoomDetail, AdminStats, AdminTopTrack } from '~/types/admin'

definePageMeta({ middleware: 'admin' })

const supabase = useSupabaseClient()
const router = useRouter()

const rooms = ref<AdminRoom[]>([])
const stats = ref<AdminStats | null>(null)
const topTracks = ref<AdminTopTrack[]>([])
const rateLimits = ref<AdminRateLimit[]>([])
const loading = ref(true)
const selectedId = ref<string | null>(null)
const detail = ref<AdminRoomDetail | null>(null)
const detailLoading = ref(false)

// Recherche + tri de la liste des rooms.
const query = ref('')
const sortBy = ref<'recent' | 'members' | 'tracks'>('recent')
const filteredRooms = computed(() => {
  const q = query.value.trim().toLowerCase()
  const out = q ? rooms.value.filter(r => r.id.toLowerCase().includes(q)) : [...rooms.value]
  if (sortBy.value === 'members') out.sort((a, b) => b.memberCount - a.memberCount)
  else if (sortBy.value === 'tracks') out.sort((a, b) => b.trackCount - a.trackCount)
  else out.sort((a, b) => b.lastActive.localeCompare(a.lastActive))
  return out
})

async function loadOverview() {
  try {
    const [data, rl] = await Promise.all([
      $fetch('/api/admin/overview'),
      // Best-effort : une erreur ici ne doit pas déconnecter le dashboard.
      $fetch('/api/admin/ratelimits').catch(() => rateLimits.value)
    ])
    rooms.value = data.rooms
    stats.value = data.stats
    topTracks.value = data.topTracks
    rateLimits.value = rl
    // Rafraîchit / ferme le détail ouvert selon qu'il existe encore.
    if (selectedId.value) {
      if (!data.rooms.some(r => r.id === selectedId.value)) {
        selectedId.value = null
        detail.value = null
      } else {
        refreshDetail()
      }
    }
  } catch {
    // 401/403 → retour au login.
    await router.push('/admin/login')
  } finally {
    loading.value = false
  }
}

async function refreshDetail() {
  if (!selectedId.value) return
  try {
    detail.value = await $fetch(`/api/admin/room/${selectedId.value}`)
  } catch {
    detail.value = null
  }
}

async function openRoom(id: string) {
  selectedId.value = id
  detailLoading.value = true
  detail.value = null
  await refreshDetail()
  detailLoading.value = false
}

async function logout() {
  await supabase.auth.signOut()
  await router.push('/admin/login')
}

// --- Actions de modération (toutes derrière requireAdmin côté serveur) ---
const acting = ref(false)
const announceMsg = ref('')

async function adminPost(url: string, body: Record<string, unknown>) {
  acting.value = true
  try {
    await $fetch(url, { method: 'POST', body })
  } catch {
    // best-effort : on resynchronise quoi qu'il arrive
  } finally {
    acting.value = false
    await loadOverview()
  }
}
function skipTrack() {
  if (selectedId.value) adminPost('/api/admin/room/skip', { roomId: selectedId.value })
}
function setRoomPlaying(playing: boolean) {
  if (selectedId.value) adminPost('/api/admin/room/playing', { roomId: selectedId.value, playing })
}
function removeTrack(trackId: string) {
  adminPost('/api/admin/track/remove', { trackId })
}
function moderateMember(uid: string, muted: boolean) {
  if (selectedId.value) adminPost('/api/admin/member/moderate', { roomId: selectedId.value, uid, muted })
}
async function deleteRoom() {
  if (!selectedId.value) return
  if (!confirm(`Supprimer définitivement la room ${selectedId.value} ?`)) return
  await adminPost('/api/admin/room/delete', { roomId: selectedId.value })
}
async function sendAnnounce() {
  const message = announceMsg.value.trim()
  if (!selectedId.value || !message) return
  announceMsg.value = ''
  await adminPost('/api/admin/announce', { roomId: selectedId.value, message })
}

// Rafraîchissement : Realtime (live) + poll de secours toutes les 30 s.
let timer: ReturnType<typeof setInterval> | null = null
let channel: ReturnType<typeof supabase.channel> | null = null
let debounce: ReturnType<typeof setTimeout> | null = null
function scheduleReload() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(loadOverview, 800)
}

onMounted(() => {
  loadOverview()
  timer = setInterval(loadOverview, 30_000)
  channel = supabase.channel('admin-dash')
  for (const table of ['rooms', 'members', 'tracks', 'votes'] as const) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload)
  }
  channel.subscribe()
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (debounce) clearTimeout(debounce)
  if (channel) supabase.removeChannel(channel)
})

const now = ref(Date.now())
onMounted(() => {
  const t = setInterval(() => (now.value = Date.now()), 5_000)
  onBeforeUnmount(() => clearInterval(t))
})

// Membre présent = vu il y a < 60 s (même fenêtre que l'app).
function present(lastSeen: string) {
  return now.value - new Date(lastSeen).getTime() < 60_000
}
function fmtAgo(iso: string) {
  const s = Math.max(0, Math.round((now.value - new Date(iso).getTime()) / 1000))
  if (s < 60) return `il y a ${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m}min`
  return `il y a ${Math.round(m / 60)}h`
}
function fmtDuration(sec: number | null) {
  if (!sec || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
function shortUid(uid: string) {
  return uid.slice(0, 8)
}

// --- Rate limit : compte à rebours live (basé sur `now`, tick 5 s) ---
function secsUntil(iso: string) {
  return Math.max(0, Math.round((new Date(iso).getTime() - now.value) / 1000))
}
// Une IP est « libérée » quand sa fenêtre qui expire le plus tard est passée.
function freeIn(rl: AdminRateLimit) {
  return Math.max(...rl.blocks.map(b => secsUntil(b.expiresAt)))
}
function fmtCountdown(sec: number) {
  const m = Math.floor(sec / 60)
  return `${m}:${(sec % 60).toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="min-h-dvh bg-[#070510] text-white">
    <!-- En-tête -->
    <header class="flex items-center justify-between border-b border-white/10 px-5 py-3">
      <div class="flex items-center gap-2">
        <h1 class="text-lg font-bold">
          Platine · Admin
        </h1>
        <span
          class="size-2 rounded-full bg-emerald-400"
          title="Temps réel actif"
        />
      </div>
      <button
        class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
        @click="logout"
      >
        Déconnexion
      </button>
    </header>

    <!-- Barre de stats globales -->
    <div class="grid grid-cols-2 gap-3 p-5 pb-0 sm:grid-cols-4">
      <div
        v-for="s in [
          { label: 'Rooms actives', value: stats?.activeRooms ?? 0 },
          { label: 'Membres en ligne', value: stats?.membersOnline ?? 0 },
          { label: 'Morceaux en file', value: stats?.tracksQueued ?? 0 },
          { label: 'Votes', value: stats?.votes ?? 0 }
        ]"
        :key="s.label"
        class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
      >
        <div class="text-2xl font-bold tabular-nums">
          {{ s.value }}
        </div>
        <div class="text-xs text-white/40">
          {{ s.label }}
        </div>
      </div>
    </div>

    <div class="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <!-- Colonne gauche : rooms + top morceaux -->
      <div class="space-y-4">
        <section class="rounded-2xl border border-white/10 bg-white/5">
          <div class="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <span class="text-sm font-semibold text-white/70">Rooms</span>
            <input
              v-model="query"
              placeholder="Filtrer par code…"
              class="ml-auto w-32 rounded-lg bg-white/5 px-2.5 py-1 text-xs outline-none placeholder:text-white/30 focus:w-40 focus:bg-white/10"
            >
            <select
              v-model="sortBy"
              class="cursor-pointer rounded-lg bg-white/5 px-2 py-1 text-xs text-white/70 outline-none"
            >
              <option value="recent">
                Récent
              </option>
              <option value="members">
                Membres
              </option>
              <option value="tracks">
                Morceaux
              </option>
            </select>
          </div>
          <div
            v-if="loading && !rooms.length"
            class="p-6 text-center text-sm text-white/40"
          >
            Chargement…
          </div>
          <div
            v-else-if="!filteredRooms.length"
            class="p-6 text-center text-sm text-white/40"
          >
            {{ query ? 'Aucune room ne correspond.' : 'Aucune room active.' }}
          </div>
          <ul
            v-else
            class="divide-y divide-white/5"
          >
            <li
              v-for="r in filteredRooms"
              :key="r.id"
            >
              <button
                class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                :class="selectedId === r.id ? 'bg-white/10' : ''"
                @click="openRoom(r.id)"
              >
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="font-mono text-sm font-bold tracking-wider">{{ r.id }}</span>
                    <span
                      v-if="r.playing"
                      class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
                    >▶</span>
                  </span>
                  <span
                    v-if="r.nowPlaying"
                    class="mt-0.5 block truncate text-xs text-white/40"
                  >{{ r.nowPlaying }}</span>
                </span>
                <span class="flex shrink-0 items-center gap-3 text-xs text-white/50">
                  <span>{{ r.memberCount }} 👤</span>
                  <span>{{ r.trackCount }} 🎵</span>
                  <span class="w-16 text-right">{{ fmtAgo(r.lastActive) }}</span>
                </span>
              </button>
            </li>
          </ul>
        </section>

        <!-- Top morceaux (popular_tracks) -->
        <section
          v-if="topTracks.length"
          class="rounded-2xl border border-white/10 bg-white/5"
        >
          <div class="border-b border-white/10 px-4 py-2.5 text-sm font-semibold text-white/70">
            Les plus ajoutés
          </div>
          <ul class="divide-y divide-white/5">
            <li
              v-for="(tk, i) in topTracks"
              :key="i"
              class="flex items-center gap-3 px-4 py-2 text-sm"
            >
              <span class="w-4 shrink-0 text-center text-xs font-bold text-white/30">{{ i + 1 }}</span>
              <img
                :src="tk.cover"
                alt=""
                class="size-8 shrink-0 rounded object-cover"
              >
              <span class="min-w-0 flex-1">
                <span class="block truncate">{{ tk.title }}</span>
                <span class="block truncate text-xs text-white/40">{{ tk.artist }}</span>
              </span>
              <span class="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                {{ tk.addCount }}×
              </span>
            </li>
          </ul>
        </section>

        <!-- Rate limit : IP actuellement bloquées + temps restant -->
        <section class="rounded-2xl border border-white/10 bg-white/5">
          <div class="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <span class="text-sm font-semibold text-white/70">Rate limit</span>
            <span
              v-if="rateLimits.length"
              class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300"
            >{{ rateLimits.length }}</span>
          </div>
          <div
            v-if="!rateLimits.length"
            class="p-6 text-center text-sm text-white/40"
          >
            Aucune IP limitée.
          </div>
          <ul
            v-else
            class="divide-y divide-white/5"
          >
            <li
              v-for="rl in rateLimits"
              :key="rl.ip"
              class="px-4 py-2.5"
            >
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ rl.ip }}</span>
                <span class="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-300">
                  libérée dans {{ fmtCountdown(freeIn(rl)) }}
                </span>
              </div>
              <div class="mt-1 flex flex-wrap gap-1">
                <span
                  v-for="(b, i) in rl.blocks"
                  :key="i"
                  class="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/50"
                  :title="`${b.count} / ${b.limit} sur ${b.window}`"
                >{{ b.action }} · {{ b.window }}</span>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <!-- Détail room -->
      <section class="rounded-2xl border border-white/10 bg-white/5">
        <div
          v-if="!selectedId"
          class="grid h-full min-h-48 place-items-center p-6 text-sm text-white/40"
        >
          Sélectionne une room pour voir le détail.
        </div>
        <div
          v-else-if="detailLoading"
          class="grid h-full min-h-48 place-items-center p-6 text-sm text-white/40"
        >
          Chargement…
        </div>
        <div
          v-else-if="detail"
          class="p-4"
        >
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="font-mono text-lg font-bold tracking-wider">
              {{ detail.id }}
            </h2>
            <span class="text-xs text-white/40">mode {{ detail.mode }}</span>
            <span class="text-xs text-white/40">créée {{ fmtAgo(detail.createdAt) }}</span>
            <span
              v-if="detail.autoplay"
              class="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60"
            >autoplay</span>
          </div>
          <p class="mt-1 text-xs text-white/40">
            Hôte : <span class="font-mono">{{ shortUid(detail.hostId) }}</span>
            · Créateur : <span class="font-mono">{{ detail.ownerId ? shortUid(detail.ownerId) : '—' }}</span>
          </p>

          <!-- Actions admin sur la room -->
          <div class="mt-3 flex flex-wrap gap-2">
            <a
              :href="`/room/${detail.id}`"
              target="_blank"
              rel="noopener"
              class="cursor-pointer rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-500/15"
            >
              ↗ Rejoindre la room
            </a>
            <button
              class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-50"
              :disabled="acting"
              @click="setRoomPlaying(!detail.playing)"
            >
              {{ detail.playing ? '⏸ Pause' : '▶ Lecture' }}
            </button>
            <button
              class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-50"
              :disabled="acting || !detail.tracks.length"
              @click="skipTrack"
            >
              ⏭ Skip
            </button>
            <button
              class="cursor-pointer rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
              :disabled="acting"
              @click="deleteRoom"
            >
              🗑 Supprimer la room
            </button>
          </div>

          <!-- Annonce « god mode » poussée dans la room -->
          <div class="mt-2 flex gap-2">
            <input
              v-model="announceMsg"
              maxlength="200"
              placeholder="Annonce god mode…"
              class="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs outline-none placeholder:text-white/30 focus:border-fuchsia-400/60"
              @keyup.enter="sendAnnounce"
            >
            <button
              class="shrink-0 cursor-pointer rounded-lg bg-gradient-to-r from-fuchsia-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              :disabled="acting || !announceMsg.trim()"
              @click="sendAnnounce"
            >
              Envoyer
            </button>
          </div>

          <!-- Membres -->
          <h3 class="mt-4 mb-2 text-sm font-semibold text-white/70">
            Membres ({{ detail.members.length }})
          </h3>
          <ul class="space-y-1">
            <li
              v-for="m in detail.members"
              :key="m.uid"
              class="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm"
            >
              <span
                class="size-2 shrink-0 rounded-full"
                :class="present(m.lastSeen) ? 'bg-emerald-400' : 'bg-white/20'"
              />
              <span class="truncate">{{ m.name || shortUid(m.uid) }}</span>
              <span class="font-mono text-[10px] text-white/30">{{ shortUid(m.uid) }}</span>
              <span
                v-if="m.muted"
                class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300"
              >muté</span>
              <span class="ml-auto text-xs text-white/40">{{ fmtAgo(m.lastSeen) }}</span>
              <!-- Muter / démuter (sauf l'hôte) -->
              <button
                v-if="m.uid !== detail.hostId"
                class="shrink-0 cursor-pointer rounded p-1 transition disabled:opacity-50"
                :class="m.muted ? 'text-amber-400 hover:bg-amber-500/15' : 'text-white/40 hover:bg-white/10 hover:text-white'"
                :disabled="acting"
                :title="m.muted ? 'Rendre le droit d\'ajouter' : 'Retirer le droit d\'ajouter'"
                @click="moderateMember(m.uid, !m.muted)"
              >
                <UIcon
                  :name="m.muted ? 'i-lucide-circle-slash' : 'i-lucide-ban'"
                  class="block size-4"
                />
              </button>
            </li>
          </ul>

          <!-- File -->
          <h3 class="mt-4 mb-2 text-sm font-semibold text-white/70">
            File ({{ detail.tracks.length }})
          </h3>
          <ul class="space-y-1">
            <li
              v-for="tk in detail.tracks"
              :key="tk.id"
              class="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/5"
              :class="tk.id === detail.currentTrackId ? 'bg-emerald-500/10' : ''"
            >
              <img
                :src="tk.cover"
                alt=""
                class="size-9 shrink-0 rounded object-cover"
              >
              <span class="min-w-0 flex-1">
                <span class="block truncate">{{ tk.title }}</span>
                <span class="block truncate text-xs text-white/40">
                  {{ tk.artist }}<template v-if="fmtDuration(tk.duration)"> · {{ fmtDuration(tk.duration) }}</template>
                </span>
              </span>
              <a
                :href="`https://youtu.be/${tk.externalId}`"
                target="_blank"
                rel="noopener"
                class="shrink-0 text-xs text-white/30 transition hover:text-white/70"
              >↗</a>
              <span class="shrink-0 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-semibold text-fuchsia-300">
                {{ tk.votes }} ▲
              </span>
              <!-- Retirer le morceau -->
              <button
                class="shrink-0 cursor-pointer rounded p-1 text-white/40 transition hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                :disabled="acting"
                title="Retirer ce morceau"
                @click="removeTrack(tk.id)"
              >
                <UIcon
                  name="i-lucide-x"
                  class="block size-4"
                />
              </button>
            </li>
          </ul>
        </div>
        <div
          v-else
          class="grid h-full min-h-48 place-items-center p-6 text-sm text-white/40"
        >
          Room introuvable (peut-être expirée).
        </div>
      </section>
    </div>
  </div>
</template>
