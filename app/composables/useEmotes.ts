/**
 * Emotes / réactions en temps réel (style Google Meet / Teams).
 *
 * Transport : Supabase **broadcast** (éphémère, aucune écriture en DB) — chaque
 * clic envoie un événement à tous les participants de la room. `self: true` →
 * l'émetteur voit aussi sa propre emote.
 *
 * Rendu : on passe par **Twemoji** (emojis Twitter en SVG) plutôt que les
 * emojis natifs, pour un rendu identique sur tous les OS/navigateurs.
 */

export interface EmoteDef {
  /** Code-point Twemoji (nom du fichier SVG) */
  code: string
  /** Caractère emoji (pour l'attribut alt) */
  char: string
  /** Libellé court (aria-label) */
  label: string
}

// Les 5 emotes disponibles, dans l'ordre d'affichage.
export const EMOTES: EmoteDef[] = [
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
  let channel: ReturnType<typeof supabase.channel> | null = null
  let seq = 0

  /** Fait apparaître une emote à l'écran (fade-in par le bas + rotation). */
  function spawn(code: string) {
    // Sécurité : on n'affiche que les emotes connues.
    if (!EMOTES.some(e => e.code === code)) return
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
    channel?.send({ type: 'broadcast', event: 'emote', payload: { code } })
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

  return { active, send }
}
