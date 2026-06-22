import { describe, it, expect } from 'vitest'
import { RECOMMENDED_PLAYLISTS } from '../../app/utils/recommendedPlaylists'

describe('RECOMMENDED_PLAYLISTS', () => {
  it('chaque entrée a un label non vide', () => {
    for (const p of RECOMMENDED_PLAYLISTS) expect(p.label.trim().length).toBeGreaterThan(0)
  })

  it('les ids renseignés ressemblent à des ids de playlist YouTube', () => {
    // Les entrées à id vide sont volontairement masquées côté UI.
    for (const p of RECOMMENDED_PLAYLISTS.filter(x => x.id)) {
      expect(p.id).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('pas de label en double', () => {
    const labels = RECOMMENDED_PLAYLISTS.map(p => p.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
