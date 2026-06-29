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

// --- Barre des emotes : CLASSEMENT PAR USAGE, figé pendant la session ---
//
// On persiste un compteur d'utilisation par emoji. La barre affichée est un
// SNAPSHOT calculé au montage (les plus utilisés d'abord) qui NE bouge PAS
// pendant qu'on tape (sinon le bouton se déplace sous le doigt quand on spamme).
// Le classement se met à jour au prochain passage dans une room.
const USAGE_KEY = 'platine:emotes:usage'
const OLD_RECENT_KEY = 'platine:emotes:recent' // ancien format (array de récents)
const BAR_BASE = 5 // taille de la barre figée (top usages + défauts)
const BAR_MAX = 7 // + emojis NOUVEAUX ajoutés en cours de session (à la fin)

type Usage = Record<string, { char: string, count: number }>

/** Lit les compteurs d'usage (validés). Migration douce depuis l'ancien format
 *  « récents » (array) pour ne pas perdre les emojis déjà utilisés. */
function loadUsage(): Usage {
  if (!import.meta.client) return {}
  const out: Usage = {}
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}')
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [code, v] of Object.entries(raw)) {
        const e = v as { char?: unknown, count?: unknown }
        if (isValidCode(code) && typeof e?.char === 'string' && e.char.length <= 16 && typeof e?.count === 'number') {
          out[code] = { char: e.char, count: Math.max(0, Math.floor(e.count)) }
        }
      }
    }
  } catch { /* corrompu → vide */ }

  // Reprise de l'ancien format si aucun usage enregistré.
  if (!Object.keys(out).length) {
    try {
      const old = JSON.parse(localStorage.getItem(OLD_RECENT_KEY) || '[]')
      if (Array.isArray(old)) {
        old.forEach((e: { code?: unknown, char?: unknown }, i: number) => {
          if (isValidCode(e?.code) && typeof e?.char === 'string' && e.char.length <= 16) {
            out[e.code] = { char: e.char, count: old.length - i } // conserve l'ordre
          }
        })
      }
    } catch { /* ignore */ }
  }
  return out
}

/** Snapshot de la barre : top usages (desc) puis complété avec les défauts. */
function buildBar(usage: Usage): EmoteDef[] {
  const ranked = Object.entries(usage)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([code, v]) => ({ code, char: v.char, label: v.char }))
  const out: EmoteDef[] = []
  const seen = new Set<string>()
  for (const def of [...ranked, ...EMOTES]) {
    if (seen.has(def.code)) continue
    seen.add(def.code)
    out.push(def)
    if (out.length >= BAR_BASE) break
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
  const usage = loadUsage()
  // Barre FIGÉE pour la session (ne se réordonne pas quand on tape).
  const recent = ref<EmoteDef[]>(buildBar(usage))
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

  /** Comptabilise un usage (persisté). N'A PAS d'effet sur l'ORDRE de la barre
   *  pendant la session (anti « le bouton bouge quand je spamme »). Seul cas où
   *  la barre change : un emoji NOUVEAU (pas déjà affiché) est ajouté À LA FIN,
   *  sans déplacer les boutons existants, pour pouvoir le spammer aussitôt. */
  function pushRecent(code: string, char: string) {
    if (!isValidCode(code)) return
    const entry = usage[code] ?? { char, count: 0 }
    entry.char = char
    entry.count += 1
    usage[code] = entry
    if (import.meta.client) localStorage.setItem(USAGE_KEY, JSON.stringify(usage))

    if (!recent.value.some(e => e.code === code)) {
      const next = [...recent.value, { code, char, label: char }]
      // Plafond : on ne retire JAMAIS les BAR_BASE premiers (figés) → on retire
      // le plus ancien emoji ajouté en session si on dépasse.
      if (next.length > BAR_MAX) next.splice(BAR_BASE, 1)
      recent.value = next
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
