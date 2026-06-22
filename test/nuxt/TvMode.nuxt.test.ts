// @vitest-environment nuxt
import { describe, it, expect } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import TvMode from '~/components/TvMode.vue'
import type { QueueTrack } from '~/composables/useQueue'

// i18n n'est pas initialisé dans le contexte de montage isolé → on stub `t`
// par l'identité (les assertions portent sur les props et le formatage, pas
// sur les traductions).
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }))

function track(id: string, title: string, artist: string): QueueTrack {
  return { id, title, artist, cover: '', source: 'youtube', externalId: id, addedBy: 'x', voters: [], createdAt: 0 }
}

const base = {
  trackId: 't1',
  cover: '/sample-cover.svg',
  title: 'Lose Control',
  artist: 'Teddy Swims',
  upNext: [track('a', 'The Hills', 'The Weeknd'), track('b', 'Swim', 'Chase Atlantic'), track('c', 'Often', 'The Weeknd')],
  playing: true,
  progress: 0.25,
  current: 50,
  duration: 200,
  isHost: true,
  accent: '#ff8800',
  bg: '#221100'
}

describe('TvMode', () => {
  it('affiche le titre et l’artiste du morceau en cours', async () => {
    const wrapper = await mountSuspended(TvMode, { props: base })
    expect(wrapper.text()).toContain('Lose Control')
    expect(wrapper.text()).toContain('Teddy Swims')
  })

  it('liste la file à venir avec une opacité décroissante (le prochain = le plus blanc)', async () => {
    const wrapper = await mountSuspended(TvMode, { props: base })
    const items = wrapper.findAll('ul li')
    expect(items).toHaveLength(3)
    const op = (i: number) => Number((items[i]!.element as HTMLElement).style.opacity)
    expect(op(0)).toBeGreaterThan(op(1))
    expect(op(1)).toBeGreaterThan(op(2))
  })

  it('affiche l’état « en attente » quand aucun morceau ne joue', async () => {
    const wrapper = await mountSuspended(TvMode, { props: { ...base, title: '', artist: '', trackId: '' } })
    expect(wrapper.text()).not.toContain('Lose Control')
    // Un titre de repli (texte d’attente i18n) est rendu, non vide.
    expect(wrapper.find('h2').text().length).toBeGreaterThan(0)
  })

  it('affiche la timeline quand un morceau joue (durée > 0)', async () => {
    const wrapper = await mountSuspended(TvMode, { props: base })
    expect(wrapper.html()).toContain('3:20') // 200 s = 3:20
  })

  it('masque la timeline quand rien ne joue (durée = 0)', async () => {
    const wrapper = await mountSuspended(TvMode, { props: { ...base, title: '', duration: 0, current: 0 } })
    expect(wrapper.html()).not.toMatch(/\d+:\d{2}/)
  })

  it('émet « exit » au clic sur le bouton de sortie', async () => {
    const wrapper = await mountSuspended(TvMode, { props: base })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('exit')).toBeTruthy()
  })
})
