<script setup lang="ts">
const { t } = useI18n()

// Génère un code de room court, lisible (sans caractères ambigus).
function newRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// --- Flow "Créer une room" ---
// Une seule étape : le mode d'écoute. La source est YouTube (seule source).
type RoomMode = 'speaker' | 'each'
const showCreate = ref(false)

function openCreate() {
  showCreate.value = true
}

function createRoom(mode: RoomMode) {
  showCreate.value = false
  const code = newRoomCode()
  // L'intention de création (mode) passe par sessionStorage, pas par l'URL :
  // on garde une URL propre /room/CODE, partageable telle quelle.
  sessionStorage.setItem(`platine:create:${code}`, JSON.stringify({ mode }))
  navigateTo(`/room/${code}`)
}

// --- Flow "Rejoindre une room" ---
const showJoin = ref(false)
const joinCode = ref('')

function joinRoom() {
  const code = joinCode.value.trim().toUpperCase()
  if (code.length >= 4) {
    showJoin.value = false
    navigateTo(`/room/${code}`)
  }
}
</script>

<template>
  <div class="relative grid min-h-dvh place-items-center overflow-hidden bg-[#070510] px-6 text-white">
    <!-- Sélecteur de langue -->
    <div class="absolute right-5 top-5 z-20 md:right-8 md:top-8">
      <LangSwitch />
    </div>

    <!-- Fond : blobs animés (glassmorphism / liquid feel) -->
    <div class="pointer-events-none absolute inset-0">
      <div class="blob blob-a" />
      <div class="blob blob-b" />
      <div class="blob blob-c" />
    </div>

    <!-- Contenu -->
    <main class="relative z-10 flex w-full max-w-2xl flex-col items-center text-center">
      <div class="mb-6 flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-widest text-white/70 uppercase backdrop-blur-xl">
        <span class="size-2 rounded-full bg-fuchsia-400 shadow-[0_0_10px] shadow-fuchsia-400" />
        {{ t('home.badge') }}
      </div>

      <h1 class="bg-gradient-to-br from-white via-fuchsia-200 to-cyan-200 bg-clip-text pl-[0.15em] font-[Gyanko] text-8xl tracking-[0.1em] text-transparent sm:text-8xl">
        Platine
      </h1>
      <p class="mt-5 max-w-md text-lg text-white/60">
        {{ t('home.tagline') }}
      </p>

      <div class="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <button
          class="group rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-fuchsia-500/30 transition hover:scale-[1.03] hover:shadow-fuchsia-500/50"
          @click="openCreate"
        >
          {{ t('home.create') }}
        </button>
        <button
          class="rounded-2xl border border-white/15 bg-white/10 px-8 py-4 text-base font-semibold text-white backdrop-blur-xl transition hover:bg-white/20"
          @click="showJoin = true"
        >
          {{ t('home.join') }}
        </button>
      </div>
    </main>

    <!-- ───────── Modal : Créer une room ───────── -->
    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      @click.self="showCreate = false"
    >
      <div class="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-6 text-white shadow-2xl backdrop-blur-2xl">
        <h2 class="text-xl font-bold">
          {{ t('createModal.title') }}
        </h2>
        <p class="mt-1 text-sm text-white/55">
          {{ t('createModal.subtitle') }}
        </p>

        <div class="mt-5 grid grid-cols-2 gap-3">
          <!-- Même pièce -->
          <button
            class="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-center transition hover:border-fuchsia-400/60 hover:bg-white/10"
            @click="createRoom('speaker')"
          >
            <span class="relative grid h-16 w-full place-items-center">
              <UIcon
                name="i-lucide-volume-2"
                class="size-8 text-fuchsia-300"
              />
              <span class="absolute -bottom-1 flex gap-0.5">
                <UIcon
                  name="i-lucide-user"
                  class="size-3.5 text-white/50"
                />
                <UIcon
                  name="i-lucide-user"
                  class="size-3.5 text-white/50"
                />
                <UIcon
                  name="i-lucide-user"
                  class="size-3.5 text-white/50"
                />
              </span>
            </span>
            <span>
              <span class="block text-sm font-semibold">{{ t('createModal.speakerTitle') }}</span>
              <span class="mt-0.5 block text-xs text-white/50">{{ t('createModal.speakerDesc') }}</span>
            </span>
          </button>

          <!-- Chacun son ordi -->
          <button
            class="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-center transition hover:border-fuchsia-400/60 hover:bg-white/10"
            @click="createRoom('each')"
          >
            <span class="relative grid h-16 w-full place-items-center">
              <span class="flex gap-1.5">
                <UIcon
                  name="i-lucide-laptop"
                  class="size-6 text-cyan-300"
                />
                <UIcon
                  name="i-lucide-laptop"
                  class="size-6 text-cyan-300"
                />
              </span>
              <span class="absolute -bottom-1 flex gap-2">
                <UIcon
                  name="i-lucide-volume-1"
                  class="size-3.5 text-white/50"
                />
                <UIcon
                  name="i-lucide-volume-1"
                  class="size-3.5 text-white/50"
                />
              </span>
            </span>
            <span>
              <span class="block text-sm font-semibold">{{ t('createModal.eachTitle') }}</span>
              <span class="mt-0.5 block text-xs text-white/50">{{ t('createModal.eachDesc') }}</span>
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- ───────── Modal : Rejoindre une room ───────── -->
    <div
      v-if="showJoin"
      class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      @click.self="showJoin = false"
    >
      <div class="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-6 text-white shadow-2xl backdrop-blur-2xl">
        <h2 class="text-xl font-bold">
          {{ t('joinModal.title') }}
        </h2>
        <p class="mt-1 text-sm text-white/55">
          {{ t('joinModal.subtitle') }}
        </p>

        <input
          v-model="joinCode"
          :placeholder="t('joinModal.placeholder')"
          maxlength="6"
          class="mt-5 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-center text-2xl font-bold tracking-[0.3em] uppercase outline-none placeholder:tracking-normal placeholder:text-white/30 focus:border-fuchsia-400/60"
          @keyup.enter="joinRoom"
        >

        <button
          class="mt-4 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-6 py-3.5 font-semibold text-white transition enabled:hover:opacity-90 disabled:opacity-40"
          :disabled="joinCode.trim().length < 4"
          @click="joinRoom"
        >
          {{ t('joinModal.submit') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.blob {
  position: absolute;
  width: 42vw;
  height: 42vw;
  border-radius: 9999px;
  filter: blur(90px);
  opacity: 0.55;
  will-change: transform;
}
.blob-a {
  top: -8%;
  left: -6%;
  background: #d946ef;
  animation: float-a 16s ease-in-out infinite;
}
.blob-b {
  right: -10%;
  bottom: -12%;
  background: #6366f1;
  animation: float-b 20s ease-in-out infinite;
}
.blob-c {
  top: 30%;
  left: 40%;
  background: #06b6d4;
  opacity: 0.35;
  animation: float-c 24s ease-in-out infinite;
}
@keyframes float-a {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(8vw, 10vh) scale(1.15); }
}
@keyframes float-b {
  0%, 100% { transform: translate(0, 0) scale(1.1); }
  50% { transform: translate(-10vw, -8vh) scale(0.9); }
}
@keyframes float-c {
  0%, 100% { transform: translate(-50%, 0) scale(1); }
  50% { transform: translate(-40%, -12vh) scale(1.2); }
}
@media (prefers-reduced-motion: reduce) {
  .blob { animation: none; }
}
</style>
