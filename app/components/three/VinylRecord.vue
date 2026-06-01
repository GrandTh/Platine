<script setup lang="ts">
import type { Group, Texture } from 'three'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { useLoop } from '@tresjs/core'

const props = withDefaults(defineProps<{
  coverSrc: string
  /** Couleur de repli du label tant que la pochette n'est pas chargée */
  accent?: string
  /** Tours par seconde visuels (stylisé) */
  speed?: number
  /** En lecture : le disque tourne ; en pause : il ralentit jusqu'à l'arrêt */
  playing?: boolean
}>(), {
  accent: '#7c5cff',
  speed: 0.4,
  playing: true
})

// --- Texture de la pochette ---
// On passe par <img> → <canvas> → CanvasTexture : robuste pour le SVG,
// les blobs (upload) et les images distantes (CORS permettant).
const cover = ref<Texture | null>(null)

function loadCover(src: string) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    try {
      const size = 512
      const cv = document.createElement('canvas')
      cv.width = cv.height = size
      const ctx = cv.getContext('2d')
      if (!ctx) return
      // Recadrage "cover" centré (carré)
      const s = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
      const tex = new CanvasTexture(cv)
      tex.colorSpace = SRGBColorSpace
      tex.anisotropy = 8
      cover.value?.dispose()
      cover.value = tex
    } catch {
      // image distante sans CORS → on garde le label de repli
    }
  }
  img.src = src
}

watch(() => props.coverSrc, loadCover, { immediate: true })
onBeforeUnmount(() => cover.value?.dispose())

// --- Rotation du disque, avec inertie ---
// La vitesse courante tend doucement vers la vitesse cible (0 en pause),
// d'où l'effet "le disque ralentit/accélère progressivement".
const spinRef = shallowRef<Group | null>(null)
let currentSpeed = 0
const RAMP = 1.8 // plus grand = ralentit/accélère plus vite

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  const target = props.playing ? props.speed : 0
  // Lissage exponentiel, stable quel que soit le framerate.
  currentSpeed += (target - currentSpeed) * Math.min(1, delta * RAMP)
  if (spinRef.value) {
    spinRef.value.rotation.y += delta * currentSpeed * Math.PI * 2
  }
})
</script>

<template>
  <!-- Inclinaison pour un rendu 3D ; la face "label" pointe vers la caméra (+Z) -->
  <TresGroup :rotation="[Math.PI / 2 - 0.95, 0, 0]">
    <TresGroup ref="spinRef">
      <!-- Galette vinyle : noir métallique, capte l'environnement -->
      <TresMesh>
        <TresCylinderGeometry :args="[2, 2, 0.05, 96]" />
        <TresMeshStandardMaterial
          color="#0b0b0e"
          :roughness="0.3"
          :metalness="0.9"
          :env-map-intensity="1.2"
        />
      </TresMesh>

      <!-- Label central : la pochette (ou couleur de repli) -->
      <!-- :key force la recompilation du matériau quand la texture arrive -->
      <TresMesh :position="[0, 0.026, 0]">
        <TresCylinderGeometry :args="[0.78, 0.78, 0.012, 96]" />
        <TresMeshStandardMaterial
          :key="cover ? cover.uuid : 'fallback'"
          :map="cover || undefined"
          :color="cover ? '#ffffff' : accent"
          :roughness="0.55"
          :metalness="0.1"
        />
      </TresMesh>

      <!-- Reflet annulaire (anneau métallique pour l'effet liquid metal) -->
      <TresMesh
        :position="[0, 0.027, 0]"
        :rotation="[Math.PI / 2, 0, 0]"
      >
        <TresRingGeometry :args="[0.8, 0.86, 96]" />
        <TresMeshStandardMaterial
          :color="accent"
          :roughness="0.1"
          :metalness="1"
          :env-map-intensity="1.5"
        />
      </TresMesh>

      <!-- Trou central -->
      <TresMesh :position="[0, 0.034, 0]">
        <TresCylinderGeometry :args="[0.035, 0.035, 0.02, 24]" />
        <TresMeshStandardMaterial
          color="#050506"
          :roughness="0.9"
        />
      </TresMesh>
    </TresGroup>
  </TresGroup>
</template>
