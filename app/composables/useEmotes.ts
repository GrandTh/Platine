/**
 * Emotes / réactions en temps réel (style Google Meet / Teams).
 *
 * Transport : Supabase **broadcast** (éphémère, aucune écriture en DB) — chaque
 * clic envoie un événement à tous les participants de la room. `self: true` →
 * l'émetteur voit aussi sa propre emote.
 *
 * Rendu : **Twemoji** (emojis Twitter en SVG) pour un rendu identique sur tous
 * les OS/navigateurs. Le catalogue d'emojis du sélecteur vient d'emoji-mart.
 *
 * SÉCURITÉ : on ne manipule QUE des « codes » = suites de code-points hex
 * (`1f600`, `2764-fe0f`…). `isValidCode` rejette tout le reste — que ce soit une
 * emote reçue par broadcast (un client malveillant pourrait en émettre) ou les
 * récents relus du localStorage (un utilisateur pourrait y mettre autre chose
 * qu'un emoji). Le rendu se faisant via une URL Twemoji `…/<code>.svg`, aucune
 * injection n'est possible (pas de texte arbitraire, pas de XSS, pas de chemin).
 */

export interface EmoteDef {
  /** Code-point Twemoji (nom du fichier SVG) */
  code: string
  /** Caractère emoji (pour l'attribut alt) */
  char: string
  /** Libellé court (aria-label) */
  label: string
}

/** Code Twemoji d'un emoji : code-points en hex joints par « - », FE0F retiré
 *  sauf en présence d'un ZWJ (convention de nommage des fichiers Twemoji). */
export function emojiToCode(char: string): string {
  const cps = Array.from(char).map(c => c.codePointAt(0)!.toString(16))
  const hasZwj = char.includes('‍')
  return (hasZwj ? cps : cps.filter(c => c !== 'fe0f')).join('-')
}

/** Un code valide = 1 à 8 code-points hex séparés par « - ». Borne la longueur
 *  pour éviter qu'un broadcast hostile force une URL géante. */
function isValidCode(code: unknown): code is string {
  return typeof code === 'string' && /^[0-9a-f]{1,6}(-[0-9a-f]{1,6}){0,7}$/i.test(code)
}

// Les emotes par défaut (= barre « récents » initiale + complément à 5).
// Usage interne uniquement (plus importé ailleurs) → pas d'export.
const EMOTES: EmoteDef[] = [
  { code: '1f680', char: '🚀', label: 'rocket' },
  { code: '1f60d', char: '😍', label: 'love' },
  { code: '1f525', char: '🔥', label: 'fire' },
  { code: '1f92e', char: '🤮', label: 'sick' },
  { code: '1f44b', char: '👋', label: 'wave' }
]

/** URL du SVG Twemoji pour un code-point donné (rendu cross-navigateur). */
export function twemojiUrl(code: string): string {
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${code}.svg`
}

// --- Récents (par utilisateur, persistés et VALIDÉS) ---
const RECENT_KEY = 'platine:emotes:recent'
const RECENT_MAX = 5

/** Lit les récents du localStorage en ne gardant QUE des entrées valides
 *  (code = code-points, char = chaîne courte), puis complète avec les défauts. */
function loadRecent(): EmoteDef[] {
  let stored: EmoteDef[] = []
  if (import.meta.client) {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
      if (Array.isArray(raw)) {
        stored = raw
          .filter((e): e is { code: string, char: string } =>
            !!e && isValidCode(e.code) && typeof e.char === 'string' && e.char.length <= 16)
          .map(e => ({ code: e.code, char: e.char, label: e.char }))
      }
    } catch {
      // localStorage corrompu/altéré → on retombe sur les défauts.
    }
  }
  const seen = new Set<string>()
  const out: EmoteDef[] = []
  for (const def of [...stored, ...EMOTES]) {
    if (seen.has(def.code)) continue
    seen.add(def.code)
    out.push(def)
    if (out.length >= RECENT_MAX) break
  }
  return out
}

/** Une emote en cours d'animation à l'écran. */
export interface FloatingEmote {
  id: number
  code: string
  /** Rotation aléatoire (deg) */
  rot: number
  /** Position horizontale (%) */
  left: number
}

// Durée de vie d'une emote à l'écran (≈ durée de l'animation CSS).
const LIFETIME = 1100

export function useEmotes(roomId: string) {
  const supabase = useSupabaseClient()
  const active = ref<FloatingEmote[]>([])
  const recent = ref<EmoteDef[]>(loadRecent())
  let channel: ReturnType<typeof supabase.channel> | null = null
  let seq = 0

  /** Fait apparaître une emote à l'écran (fade-in par le bas + rotation). */
  function spawn(code: string) {
    if (!isValidCode(code)) return // sécurité : seulement des codes valides
    const id = ++seq
    const rot = Math.round(Math.random() * 40 - 20) // -20°..+20°
    const left = 6 + Math.random() * 46 // 6%..52% (évite le panneau de droite)
    active.value = [...active.value, { id, code, rot, left }]
    setTimeout(() => {
      active.value = active.value.filter(e => e.id !== id)
    }, LIFETIME)
  }

  /** Envoie une emote à toute la room (et à soi-même via self:true). */
  function send(code: string) {
    if (!isValidCode(code)) return
    channel?.send({ type: 'broadcast', event: 'emote', payload: { code } })
  }

  /** Mémorise un emoji utilisé en tête des « récents » (max RECENT_MAX),
   *  persisté en localStorage ({code, char}), toujours re-validé à la lecture. */
  function pushRecent(code: string, char: string) {
    if (!isValidCode(code)) return
    const def: EmoteDef = { code, char, label: char }
    recent.value = [def, ...recent.value.filter(e => e.code !== code)].slice(0, RECENT_MAX)
    if (import.meta.client) {
      localStorage.setItem(
        RECENT_KEY,
        JSON.stringify(recent.value.map(e => ({ code: e.code, char: e.char })))
      )
    }
  }

  onMounted(() => {
    channel = supabase.channel(`emotes:${roomId}`, {
      config: { broadcast: { self: true } }
    })
    channel
      .on('broadcast', { event: 'emote' }, (msg: { payload?: { code?: string } }) => {
        const code = msg.payload?.code
        if (typeof code === 'string') spawn(code)
      })
      .subscribe()
  })

  onBeforeUnmount(() => {
    if (channel) supabase.removeChannel(channel)
    channel = null
  })

  return { active, send, recent, pushRecent }
}
