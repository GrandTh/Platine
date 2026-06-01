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

// --- Léger tilt vers le curseur ---
// Le disque reste centré mais s'oriente très subtilement vers la souris.
const tiltRef = shallowRef<Group | null>(null)
const BASE_X = Math.PI / 2 - 0.95
const TILT = 0.12 // amplitude max (radians) — discret
const targetTilt = { x: 0, y: 0 }
const curTilt = { x: 0, y: 0 }

function onMouseMove(e: MouseEvent) {
  // -1..1 par rapport au centre de l'écran
  const nx = (e.clientX / window.innerWidth) * 2 - 1
  const ny = (e.clientY / window.innerHeight) * 2 - 1
  targetTilt.y = nx * TILT
  targetTilt.x = ny * TILT
}

onMounted(() => window.addEventListener('mousemove', onMouseMove))
onBeforeUnmount(() => window.removeEventListener('mousemove', onMouseMove))

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  const target = props.playing ? props.speed : 0
  // Lissage exponentiel, stable quel que soit le framerate.
  currentSpeed += (target - currentSpeed) * Math.min(1, delta * RAMP)
  if (spinRef.value) {
    spinRef.value.rotation.y += delta * currentSpeed * Math.PI * 2
  }

  // Tilt lissé vers la cible.
  const k = Math.min(1, delta * 4)
  curTilt.x += (targetTilt.x - curTilt.x) * k
  curTilt.y += (targetTilt.y - curTilt.y) * k
  if (tiltRef.value) {
    tiltRef.value.rotation.x = BASE_X + curTilt.x
    tiltRef.value.rotation.z = curTilt.y
  }
})
</script>

<template>
  <!-- Inclinaison de base + léger tilt vers le curseur (piloté dans la boucle) -->
  <TresGroup
    ref="tiltRef"
    :rotation="[BASE_X, 0, 0]"
  >
    <TresGroup ref="spinRef">
      <!-- Galette vinyle : noir profond et brillant. roughness très bas →
           reflet net facon miroir (et non un gros halo flou). -->
      <TresMesh>
        <TresCylinderGeometry :args="[2, 2, 0.05, 96]" />
        <TresMeshStandardMaterial
          color="#050507"
          :roughness="0.08"
          :metalness="1"
          :env-map-intensity="1"
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
          :env-map-intensity="1"
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
