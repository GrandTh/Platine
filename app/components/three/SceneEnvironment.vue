<script setup lang="ts">
import type { Texture, WebGLRenderer } from 'three'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useTresContext } from '@tresjs/core'

// Génère un environnement (PMREM) pour donner des reflets aux matériaux
// métalliques — c'est ce qui transforme le vinyle en "liquid metal".
const { scene, renderer } = useTresContext()

let envTex: Texture | null = null
let pmrem: PMREMGenerator | null = null
let done = false

function applyEnv(r: WebGLRenderer) {
  if (done || !r) return
  done = true
  pmrem = new PMREMGenerator(r)
  envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  if (scene.value) scene.value.environment = envTex
}

// Le renderer peut déjà être prêt au montage (onReady ne rejoue pas) :
// on couvre les deux cas (déjà initialisé + futur onReady).
watch(
  () => renderer.isInitialized?.value,
  (ok) => {
    if (ok && renderer.instance) applyEnv(renderer.instance as WebGLRenderer)
  },
  { immediate: true }
)
renderer.onReady(r => applyEnv(r as unknown as WebGLRenderer))

onBeforeUnmount(() => {
  if (scene.value) scene.value.environment = null
  envTex?.dispose()
  pmrem?.dispose()
})
</script>

<template>
  <slot />
</template>
