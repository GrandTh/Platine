<script setup lang="ts">
/**
 * Titre qui défile au survol *si* il est tronqué (trop long).
 *
 * - Au repos : comportement `truncate` classique (… en bout de ligne).
 * - Au survol de la LIGNE parente (qui doit porter la classe `group`), le texte
 *   défile en BOUCLE : il va vers la gauche pour révéler la fin, marque une
 *   pause, revient au début, et recommence tant qu'on survole.
 * - Le défilement n'a lieu que si le texte déborde réellement (mesuré en JS).
 *
 * Le déclenchement se fait via `.group:hover` (CSS global dans main.css), donc
 * survoler n'importe quelle partie de la ligne lance le défilement.
 */
const props = defineProps<{ text: string }>()

const root = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)

// Vitesse de défilement (px/s). SCROLL_FRACTION = part du cycle passée à
// défiler dans un sens (doit matcher les % des @keyframes marquee-loop).
const SPEED = 60
const SCROLL_FRACTION = 0.45
const MIN_CYCLE = 2

function measure() {
  const r = root.value
  const i = inner.value
  if (!r || !i) return
  const overflow = i.scrollWidth - i.clientWidth
  if (overflow > 2) {
    const shift = overflow + 6 // petite marge pour bien voir la fin
    const oneWay = shift / SPEED // temps d'un aller
    const cycle = Math.max(MIN_CYCLE, oneWay / SCROLL_FRACTION) // boucle complète
    r.style.setProperty('--marquee-shift', `-${shift}px`)
    r.style.setProperty('--marquee-dur', `${cycle.toFixed(2)}s`)
  } else {
    r.style.setProperty('--marquee-shift', '0px')
    r.style.setProperty('--marquee-dur', '0s')
  }
}

let ro: ResizeObserver | null = null
onMounted(() => {
  nextTick(measure)
  ro = new ResizeObserver(() => measure())
  if (root.value) ro.observe(root.value)
})
watch(() => props.text, () => nextTick(measure))
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <span
    ref="root"
    class="marquee block"
  >
    <span
      ref="inner"
      class="block truncate"
    >{{ text }}</span>
  </span>
</template>
