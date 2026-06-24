<script setup lang="ts">
/**
 * Sélecteur d'emojis emoji-mart, chargé À LA DEMANDE (dynamic import) → la lib
 * (~200 Ko) n'alourdit pas le chargement initial de la room. Rendu en set
 * « native » (emojis de l'OS) → fiable, sans images externes (le set Twitter
 * dépend d'un CDN de sprites qui peut ne pas charger). Les réactions flottantes,
 * elles, restent en Twemoji (rendu identique pour tous). Émet `select` avec
 * l'emoji natif ; la conversion en code Twemoji + la sécurité sont gérées par
 * l'appelant (useEmotes).
 */
const emit = defineEmits<{ select: [native: string] }>()

const host = ref<HTMLElement | null>(null)
let picker: HTMLElement | null = null

onMounted(async () => {
  const [{ Picker }, data] = await Promise.all([
    import('emoji-mart'),
    import('@emoji-mart/data')
  ])
  picker = new Picker({
    data: (data as { default: unknown }).default,
    set: 'native',
    theme: 'dark',
    previewPosition: 'none',
    autoFocus: true,
    dynamicWidth: true, // épouse la largeur du conteneur (responsive mobile)
    onEmojiSelect: (e: { native?: string }) => {
      if (e?.native) emit('select', e.native)
    }
  }) as unknown as HTMLElement
  // Remplit le conteneur (dont la hauteur est plafonnée côté wrapper) → emoji-mart
  // scrolle à l'intérieur et ne déborde jamais de l'écran.
  picker.style.width = '100%'
  picker.style.maxWidth = '100%'
  picker.style.height = '100%'
  host.value?.appendChild(picker)
})

onBeforeUnmount(() => {
  picker?.remove()
  picker = null
})
</script>

<template>
  <div ref="host" />
</template>
