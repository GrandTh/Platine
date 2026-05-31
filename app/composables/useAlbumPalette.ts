import { Vibrant } from 'node-vibrant/browser'
import { Color } from 'three'

export interface AlbumPalette {
  /** Couleur la plus saturée — accent principal */
  vibrant: Color
  /** Variante sombre saturée — bon pour les fonds */
  darkVibrant: Color
  /** Variante claire saturée */
  lightVibrant: Color
  /** Couleur désaturée — fond neutre */
  muted: Color
  /** Variante désaturée sombre */
  darkMuted: Color
  /** Variante désaturée claire */
  lightMuted: Color
}

const FALLBACK: AlbumPalette = {
  vibrant: new Color('#7c5cff'),
  darkVibrant: new Color('#2a1a66'),
  lightVibrant: new Color('#c8b8ff'),
  muted: new Color('#6b6b8a'),
  darkMuted: new Color('#1a1a2e'),
  lightMuted: new Color('#b0b0c8')
}

/**
 * Extrait une palette de couleurs depuis une pochette d'album.
 * Réactif : refais simplement `await extract(src)` à chaque changement de pochette.
 */
export function useAlbumPalette() {
  const palette = ref<AlbumPalette>({ ...FALLBACK })
  const loading = ref(false)
  const error = ref<string | null>(null)

  function toColor(hex: string | undefined, fallback: Color): Color {
    return hex ? new Color(hex) : fallback.clone()
  }

  async function extract(src: string): Promise<AlbumPalette> {
    loading.value = true
    error.value = null
    try {
      const raw = await Vibrant.from(src).getPalette()
      const next: AlbumPalette = {
        vibrant: toColor(raw.Vibrant?.hex, FALLBACK.vibrant),
        darkVibrant: toColor(raw.DarkVibrant?.hex, FALLBACK.darkVibrant),
        lightVibrant: toColor(raw.LightVibrant?.hex, FALLBACK.lightVibrant),
        muted: toColor(raw.Muted?.hex, FALLBACK.muted),
        darkMuted: toColor(raw.DarkMuted?.hex, FALLBACK.darkMuted),
        lightMuted: toColor(raw.LightMuted?.hex, FALLBACK.lightMuted)
      }
      palette.value = next
      return next
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Extraction de palette impossible'
      palette.value = { ...FALLBACK }
      return palette.value
    } finally {
      loading.value = false
    }
  }

  return { palette, loading, error, extract }
}
