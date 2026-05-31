<script setup lang="ts">
import type { Color } from 'three'
import { ShaderMaterial } from 'three'
import { useLoop } from '@tresjs/core'
import type { AlbumPalette } from '~/composables/useAlbumPalette'

const props = defineProps<{
  palette: AlbumPalette
}>()

// Bruit simplex 3D (Ashima) pour l'effet liquide qui s'écoule.
const noiseGLSL = /* glsl */ `
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorD;
${noiseGLSL}

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.08;

  // Plusieurs couches de bruit pour un mélange organique et liquide.
  float n1 = snoise(vec3(uv * 1.8, t));
  float n2 = snoise(vec3(uv * 3.2 + 10.0, t * 1.4));
  float n3 = snoise(vec3(uv * 0.9 - 5.0, t * 0.6));

  float m1 = smoothstep(-0.6, 0.6, n1);
  float m2 = smoothstep(-0.6, 0.6, n2 + n3 * 0.5);

  vec3 col = mix(uColorD, uColorA, m1);
  col = mix(col, uColorB, m2 * 0.7);
  col = mix(col, uColorC, smoothstep(0.3, 1.0, m1 * m2));

  // Léger vignettage pour concentrer la lumière au centre.
  float d = distance(uv, vec2(0.5));
  col *= 1.0 - d * 0.55;

  gl_FragColor = vec4(col, 1.0);
}
`

const material = new ShaderMaterial({
  vertexShader,
  fragmentShader,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uColorA: { value: props.palette.vibrant.clone() },
    uColorB: { value: props.palette.lightVibrant.clone() },
    uColorC: { value: props.palette.darkVibrant.clone() },
    uColorD: { value: props.palette.darkMuted.clone() }
  }
})

// Met à jour les couleurs quand la pochette change, sans recréer le matériau.
watch(
  () => props.palette,
  (p) => {
    ;(material.uniforms.uColorA!.value as Color).copy(p.vibrant)
    ;(material.uniforms.uColorB!.value as Color).copy(p.lightVibrant)
    ;(material.uniforms.uColorC!.value as Color).copy(p.darkVibrant)
    ;(material.uniforms.uColorD!.value as Color).copy(p.darkMuted)
  },
  { deep: true }
)

const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }) => {
  material.uniforms.uTime!.value = elapsed
})
</script>

<template>
  <TresMesh
    :position="[0, 0, -6]"
    :material="material"
  >
    <TresPlaneGeometry :args="[40, 24]" />
  </TresMesh>
</template>
