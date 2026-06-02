<script setup lang="ts">
import type { CSSProperties } from 'vue'

// Effet vue-bits : la graisse des lettres réagit à la proximité du curseur.
// Nécessite une police variable (axe 'wght') pour un effet visible.
export type FalloffType = 'linear' | 'exponential' | 'gaussian'

interface Props {
  label: string
  fromFontVariationSettings: string
  toFontVariationSettings: string
  containerRef?: HTMLElement | null
  radius?: number
  falloff?: FalloffType
  className?: string
  style?: CSSProperties
}

const props = withDefaults(defineProps<Props>(), {
  containerRef: null,
  radius: 50,
  falloff: 'linear',
  className: '',
  style: () => ({})
})

const rootRef = ref<HTMLElement | null>(null)
const letterElements = ref<HTMLElement[]>([])
const mousePosition = ref({ x: 0, y: 0 })
const lastPosition = ref<{ x: number | null, y: number | null }>({ x: null, y: null })

let animationFrameId: number | null = null

const words = computed(() => props.label.split(' '))

const parsedSettings = computed(() => {
  const parse = (s: string) => {
    const map = new Map<string, number>()
    s.split(',').forEach((part) => {
      const bits = part.trim().split(' ')
      if (bits.length === 2) {
        map.set(bits[0]!.replace(/['"]/g, ''), Number.parseFloat(bits[1]!))
      }
    })
    return map
  }
  const from = parse(props.fromFontVariationSettings)
  const to = parse(props.toFontVariationSettings)
  return Array.from(from.entries()).map(([axis, fromValue]) => ({
    axis,
    fromValue,
    toValue: to.get(axis) ?? fromValue
  }))
})

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

function computeFalloff(distance: number) {
  const norm = Math.min(Math.max(1 - distance / props.radius, 0), 1)
  if (props.falloff === 'exponential') return norm ** 2
  if (props.falloff === 'gaussian') return Math.exp(-((distance / (props.radius / 2)) ** 2) / 2)
  return norm
}

function letterKey(w: number, l: number) {
  return `${w}-${l}`
}

function initLetters() {
  if (!rootRef.value) return
  letterElements.value = Array.from(rootRef.value.querySelectorAll('.vp-letter')) as HTMLElement[]
}

function onMouseMove(ev: MouseEvent) {
  const container = props.containerRef || rootRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  mousePosition.value = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
}

function loop() {
  const container = props.containerRef || rootRef.value
  if (!container || letterElements.value.length === 0) {
    animationFrameId = requestAnimationFrame(loop)
    return
  }
  if (lastPosition.value.x === mousePosition.value.x && lastPosition.value.y === mousePosition.value.y) {
    animationFrameId = requestAnimationFrame(loop)
    return
  }
  lastPosition.value = { x: mousePosition.value.x, y: mousePosition.value.y }
  const rect = container.getBoundingClientRect()

  letterElements.value.forEach((el) => {
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2 - rect.left
    const cy = r.top + r.height / 2 - rect.top
    const d = dist(mousePosition.value.x, mousePosition.value.y, cx, cy)
    if (d >= props.radius) {
      el.style.fontVariationSettings = props.fromFontVariationSettings
      return
    }
    const f = computeFalloff(d)
    el.style.fontVariationSettings = parsedSettings.value
      .map(({ axis, fromValue, toValue }) => `'${axis}' ${fromValue + (toValue - fromValue) * f}`)
      .join(', ')
  })

  animationFrameId = requestAnimationFrame(loop)
}

onMounted(() => {
  nextTick(() => {
    initLetters()
    window.addEventListener('mousemove', onMouseMove)
    animationFrameId = requestAnimationFrame(loop)
  })
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
})
</script>

<template>
  <span
    ref="rootRef"
    :class="className"
    :style="{ display: 'inline', ...style }"
  >
    <span
      v-for="(word, wordIndex) in words"
      :key="wordIndex"
      class="inline-block whitespace-nowrap"
    >
      <span
        v-for="(letter, letterIndex) in word.split('')"
        :key="letterKey(wordIndex, letterIndex)"
        class="vp-letter inline-block"
        :style="{ fontVariationSettings: fromFontVariationSettings }"
        aria-hidden="true"
      >{{ letter }}</span>
      <span
        v-if="wordIndex < words.length - 1"
        class="inline-block"
      >&nbsp;</span>
    </span>
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
