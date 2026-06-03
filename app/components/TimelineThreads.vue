<script setup lang="ts">
import { Renderer, Program, Mesh, Triangle, Color } from 'ogl'
import type { OGLRenderingContext } from 'ogl'

/**
 * Timeline "Threads" (vue-bits / ogl) détournée en barre de progression.
 *
 * - Le ruban se remplit de gauche à droite selon `progress` (0→1) :
 *   à gauche du curseur = couleur d'accent, à droite = blanc.
 * - Amplitude : 0.5 au repos, → 0 au survol (transition douce, lissée
 *   dans la boucle d'animation — pas de recréation de la scène).
 * - Clic sur le ruban → emit('seek', ratio) pour déplacer la lecture.
 */
const props = withDefaults(defineProps<{
  progress?: number
  /** Couleur de remplissage (partie déjà jouée), en RGB 0–1 */
  fillColor?: [number, number, number]
  /** Cliquable (hôte uniquement) */
  seekable?: boolean
}>(), {
  progress: 0,
  fillColor: () => [0.55, 0.36, 1] as [number, number, number],
  seekable: false
})

const emit = defineEmits<{ seek: [ratio: number] }>()

const containerRef = ref<HTMLDivElement | null>(null)

let renderer: Renderer | null = null
let gl: OGLRenderingContext | null = null
let program: Program | null = null
let mesh: Mesh | null = null
let animationId: number | null = null

// Amplitude lissée : cible 1 au repos, 0 au survol.
const AMP_IDLE = 2
let targetAmp = AMP_IDLE
let currentAmp = AMP_IDLE

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;      // couleur "non jouée" (blanc)
uniform vec3 uFillColor;  // couleur "déjà jouée" (accent)
uniform float uProgress;  // 0..1
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;

#define PI 3.1415926538

// Beaucoup de fils FINS qui s'entrelacent (comme l'original vue-bits).
// Épaisseur en FRACTION DE LA HAUTEUR du ruban (0..1) → cohérente sur
// tous les écrans, indépendante de la largeur et de la densité (DPR).
const int u_line_count = 30;
const float u_line_width = 0.045;
const float u_line_blur = 0.05;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {
    float split_offset = (perc * 0.4);
    float split_point = 0.1 + split_offset;

    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float amplitude_strength = 0.5;
    float finalAmplitude = amplitude_normal * amplitude_strength
                           * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);

    float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );

    float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

    // width et u_line_blur sont des fractions de hauteur (indépendantes du DPR).
    float line_start = smoothstep(
        y + (width / 2.0) + (u_line_blur * blur),
        y,
        st.y
    );

    float line_end = smoothstep(
        y,
        y - (width / 2.0) - (u_line_blur * blur),
        st.y
    );

    return clamp(
        (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),
        0.0,
        1.0
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * (1.0 - p),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }

    float colorVal = 1.0 - line_strength;

    // Remplissage progression : à gauche de uProgress => couleur d'accent.
    // Liseré doux au niveau de la tête de lecture.
    float fillMask = smoothstep(uProgress + 0.004, uProgress - 0.004, uv.x);
    vec3 col = mix(uColor, uFillColor, fillMask);

    fragColor = vec4(col * colorVal, colorVal);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`

function resize() {
  if (!containerRef.value || !renderer || !program) return
  const { clientWidth, clientHeight } = containerRef.value
  renderer.setSize(clientWidth, clientHeight)
  program.uniforms.iResolution.value.r = clientWidth
  program.uniforms.iResolution.value.g = clientHeight
  program.uniforms.iResolution.value.b = clientWidth / clientHeight
}

function update(t: number) {
  if (!program || !renderer || !mesh) return
  // Lissage de l'amplitude vers la cible (0.5 repos / 0 hover).
  currentAmp += (targetAmp - currentAmp) * 0.08
  program.uniforms.uAmplitude.value = currentAmp
  program.uniforms.uProgress.value = Math.min(1, Math.max(0, props.progress))
  program.uniforms.iTime.value = t * 0.001
  renderer.render({ scene: mesh })
  animationId = requestAnimationFrame(update)
}

function onEnter() {
  targetAmp = 0
}
function onLeave() {
  targetAmp = AMP_IDLE
}
function onClick(e: MouseEvent) {
  if (!props.seekable || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  emit('seek', ratio)
}

onMounted(() => {
  const container = containerRef.value
  if (!container) return

  renderer = new Renderer({ alpha: true })
  gl = renderer.gl
  gl.clearColor(0, 0, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  const geometry = new Triangle(gl)
  program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      iTime: { value: 0 },
      iResolution: {
        value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height)
      },
      uColor: { value: new Color(1, 1, 1) },
      uFillColor: { value: new Color(...props.fillColor) },
      uProgress: { value: 0 },
      uAmplitude: { value: AMP_IDLE },
      uDistance: { value: 0 },
      uMouse: { value: new Float32Array([0.5, 0.5]) }
    }
  })

  mesh = new Mesh(gl, { geometry, program })

  const canvas = gl.canvas as HTMLCanvasElement
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  container.appendChild(canvas)

  window.addEventListener('resize', resize)
  resize()
  animationId = requestAnimationFrame(update)
})

// Met à jour la couleur de remplissage si la palette change.
watch(() => props.fillColor, (c) => {
  if (program) (program.uniforms.uFillColor.value as Color).set(...c)
})

onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('resize', resize)
  if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext()
  renderer = null
  gl = null
  program = null
  mesh = null
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative h-full w-full"
    :class="seekable ? 'cursor-pointer' : ''"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @click="onClick"
  />
</template>
