<script setup lang="ts">
/**
 * Dashboard admin (lecture seule) : liste des rooms actives à gauche, détail de
 * la room sélectionnée à droite (membres + file). Données via /api/admin/*
 * (protégés par requireAdmin : session + 2FA + allowlist). Le middleware 'admin'
 * gère la redirection si non connecté/2FA.
 */
import type { AdminRoom, AdminRoomDetail } from '~/types/admin'

definePageMeta({ middleware: 'admin' })

const supabase = useSupabaseClient()
const router = useRouter()

const rooms = ref<AdminRoom[]>([])
const loading = ref(true)
const selectedId = ref<string | null>(null)
const detail = ref<AdminRoomDetail | null>(null)
const detailLoading = ref(false)

async function loadOverview() {
  loading.value = true
  try {
    const { rooms: list } = await $fetch('/api/admin/overview')
    rooms.value = list
    // Rafraîchit le détail ouvert s'il existe encore.
    if (selectedId.value && !list.some(r => r.id === selectedId.value)) {
      selectedId.value = null
      detail.value = null
    }
  } catch {
    // 401/403 → le middleware renverra au login au prochain cycle.
    await router.push('/admin/login')
  } finally {
    loading.value = false
  }
}

async function openRoom(id: string) {
  selectedId.value = id
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await $fetch(`/api/admin/room/${id}`)
  } catch {
    detail.value = null
  } finally {
    detailLoading.value = false
  }
}

async function logout() {
  await supabase.auth.signOut()
  await router.push('/admin/login')
}

// Rafraîchissement périodique de la vue d'ensemble (rooms éphémères).
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  loadOverview()
  timer = setInterval(loadOverview, 15_000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
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
      <div class="flex items-baseline gap-3">
        <h1 class="text-lg font-bold">
          Platine · Admin
        </h1>
        <span class="text-xs text-white/40">{{ rooms.length }} room(s) active(s)</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
          @click="loadOverview"
        >
          Rafraîchir
        </button>
        <button
          class="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
          @click="logout"
        >
          Déconnexion
        </button>
      </div>
    </header>

    <div class="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <!-- Liste des rooms -->
      <section class="rounded-2xl border border-white/10 bg-white/5">
        <div class="border-b border-white/10 px-4 py-2.5 text-sm font-semibold text-white/70">
          Rooms
        </div>
        <div
          v-if="loading && !rooms.length"
          class="p-6 text-center text-sm text-white/40"
        >
          Chargement…
        </div>
        <div
          v-else-if="!rooms.length"
          class="p-6 text-center text-sm text-white/40"
        >
          Aucune room active.
        </div>
        <ul
          v-else
          class="divide-y divide-white/5"
        >
          <li
            v-for="r in rooms"
            :key="r.id"
          >
            <button
              class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
              :class="selectedId === r.id ? 'bg-white/10' : ''"
              @click="openRoom(r.id)"
            >
              <span class="font-mono text-sm font-bold tracking-wider">{{ r.id }}</span>
              <span
                v-if="r.playing"
                class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
              >▶ lecture</span>
              <span class="ml-auto flex items-center gap-3 text-xs text-white/50">
                <span>{{ r.memberCount }} 👤</span>
                <span>{{ r.trackCount }} 🎵</span>
                <span>{{ fmtAgo(r.lastActive) }}</span>
              </span>
            </button>
          </li>
        </ul>
      </section>

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
