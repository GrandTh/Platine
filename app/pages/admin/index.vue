<script setup lang="ts">
/**
 * Dashboard admin (lecture seule) : barre de stats globales, liste des rooms
 * actives (recherche + tri) à gauche, détail de la room sélectionnée + top
 * morceaux à droite. Données via /api/admin/* (protégés par requireAdmin).
 * Mises à jour en **temps réel** (Realtime Supabase) + poll de secours.
 */
import type { AdminRoom, AdminRoomDetail, AdminStats, AdminTopTrack } from '~/types/admin'

definePageMeta({ middleware: 'admin' })

const supabase = useSupabaseClient()
const router = useRouter()

const rooms = ref<AdminRoom[]>([])
const stats = ref<AdminStats | null>(null)
const topTracks = ref<AdminTopTrack[]>([])
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
    const data = await $fetch('/api/admin/overview')
    rooms.value = data.rooms
    stats.value = data.stats
    topTracks.value = data.topTracks
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
