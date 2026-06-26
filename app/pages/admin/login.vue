<script setup lang="ts">
/**
 * Connexion admin — 100 % Supabase Auth.
 *  1. credentials : email + mot de passe (signInWithPassword).
 *  2a. enroll     : 1ʳᵉ fois → QR TOTP à scanner puis code de vérification.
 *  2b. challenge  : facteur déjà enrôlé → simple code 6 chiffres.
 * Succès = session aal2 → /admin. (Aucune inscription publique : le compte se
 * crée dans le Studio Supabase.)
 */
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()

type Step = 'credentials' | 'enroll' | 'challenge'
const step = ref<Step>('credentials')
const email = ref('')
const password = ref('')
const code = ref('')
const error = ref('')
const loading = ref(false)

// Données d'enrôlement TOTP.
const qr = ref('')
const secret = ref('')
const factorId = ref('')
const challengeId = ref('')

async function isAal2() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return data?.currentLevel === 'aal2'
}

// Aiguille vers le 2ᵉ facteur : challenge si un TOTP est déjà vérifié, sinon enroll.
async function routeToSecondFactor() {
  const { data } = await supabase.auth.mfa.listFactors()
  const totp = data?.totp ?? []
  if (totp.length) {
    factorId.value = totp[0]!.id
    const { data: ch, error: e } = await supabase.auth.mfa.challenge({ factorId: factorId.value })
    if (e || !ch) {
      error.value = 'Erreur lors du défi 2FA.'
      return
    }
    challengeId.value = ch.id
    step.value = 'challenge'
  } else {
    const { data: en, error: e } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `admin-${Date.now()}`
    })
    if (e || !en) {
      error.value = 'Erreur lors de l\'enrôlement 2FA.'
      return
    }
    factorId.value = en.id
    qr.value = en.totp.qr_code
    secret.value = en.totp.secret
    step.value = 'enroll'
  }
}

onMounted(async () => {
  if (!user.value) return
  if (await isAal2()) return router.push('/admin')
  await routeToSecondFactor()
})

async function signIn() {
  error.value = ''
  loading.value = true
  try {
    const { error: e } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value
    })
    if (e) {
      error.value = 'Identifiants invalides.'
      return
    }
    if (await isAal2()) return router.push('/admin')
    await routeToSecondFactor()
  } finally {
    loading.value = false
  }
}

async function verifyCode() {
  error.value = ''
  loading.value = true
  try {
    // À l'enrôlement il faut un nouveau challenge ; au challenge on réutilise l'id.
    let chId = challengeId.value
    if (step.value === 'enroll') {
      const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId: factorId.value })
      if (ce || !ch) {
        error.value = 'Code invalide.'
        return
      }
      chId = ch.id
    }
    const { error: ve } = await supabase.auth.mfa.verify({
      factorId: factorId.value,
      challengeId: chId,
      code: code.value.trim()
    })
    if (ve) {
      error.value = 'Code invalide.'
      return
    }
    await router.push('/admin')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="grid min-h-dvh place-items-center bg-[#070510] p-4 text-white">
    <div class="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
      <h1 class="text-xl font-bold">
        Administration
      </h1>
      <p class="mt-1 text-sm text-white/50">
        Accès réservé. Authentification + 2FA requises.
      </p>

      <!-- 1) Identifiants -->
      <form
        v-if="step === 'credentials'"
        class="mt-6 space-y-3"
        @submit.prevent="signIn"
      >
        <input
          v-model="email"
          type="email"
          autocomplete="username"
          placeholder="Email"
          class="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none placeholder:text-white/40 focus:border-fuchsia-400/60"
        >
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="Mot de passe"
          class="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none placeholder:text-white/40 focus:border-fuchsia-400/60"
        >
        <button
          type="submit"
          :disabled="loading"
          class="w-full cursor-pointer rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-5 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-60"
        >
          {{ loading ? 'Connexion…' : 'Se connecter' }}
        </button>
      </form>

      <!-- 2a) Enrôlement TOTP (1ʳᵉ fois) -->
      <div
        v-else-if="step === 'enroll'"
        class="mt-6 space-y-3"
      >
        <p class="text-sm text-white/70">
          Scanne ce QR code avec ton application d'authentification (Google
          Authenticator, 1Password…), puis saisis le code à 6 chiffres.
        </p>
        <div class="grid place-items-center rounded-xl bg-white p-3">
          <img
            :src="qr"
            alt="QR code 2FA"
            class="size-44"
          >
        </div>
        <p class="break-all text-center text-xs text-white/40">
          Clé manuelle : {{ secret }}
        </p>
        <input
          v-model="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="Code à 6 chiffres"
          class="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-center text-lg tracking-widest outline-none placeholder:text-sm placeholder:tracking-normal placeholder:text-white/40 focus:border-fuchsia-400/60"
          @keyup.enter="verifyCode"
        >
        <button
          :disabled="loading"
          class="w-full cursor-pointer rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-5 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-60"
          @click="verifyCode"
        >
          {{ loading ? 'Vérification…' : 'Activer la 2FA' }}
        </button>
      </div>

      <!-- 2b) Challenge TOTP -->
      <div
        v-else
        class="mt-6 space-y-3"
      >
        <p class="text-sm text-white/70">
          Saisis le code à 6 chiffres de ton application d'authentification.
        </p>
        <input
          v-model="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="Code à 6 chiffres"
          class="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-center text-lg tracking-widest outline-none placeholder:text-sm placeholder:tracking-normal placeholder:text-white/40 focus:border-fuchsia-400/60"
          @keyup.enter="verifyCode"
        >
        <button
          :disabled="loading"
          class="w-full cursor-pointer rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-5 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-60"
          @click="verifyCode"
        >
          {{ loading ? 'Vérification…' : 'Valider' }}
        </button>
      </div>

      <p
        v-if="error"
        class="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-center text-sm text-red-300"
      >
        {{ error }}
      </p>
    </div>
  </div>
</template>
