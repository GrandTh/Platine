import { describe, it, expect } from 'vitest'
import { COLOR_PALETTE, userColor, shortId } from '../../app/composables/useUserColor'

describe('COLOR_PALETTE', () => {
  it('ne contient que des hex valides', () => {
    for (const c of COLOR_PALETTE) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('ne contient aucun doublon', () => {
    expect(new Set(COLOR_PALETTE).size).toBe(COLOR_PALETTE.length)
  })
})

describe('userColor', () => {
  it('est déterministe pour un même uid', () => {
    expect(userColor('user-abcd')).toBe(userColor('user-abcd'))
  })

  it('renvoie toujours une couleur de la palette', () => {
    for (const uid of ['a', 'bbb', 'user-1234', 'x'.repeat(50)]) {
      expect(COLOR_PALETTE).toContain(userColor(uid))
    }
  })

  it('gère une chaîne vide', () => {
    expect(COLOR_PALETTE).toContain(userColor(''))
  })
})

describe('shortId', () => {
  it('formate les 4 premiers caractères en majuscules', () => {
    expect(shortId('abcd1234')).toBe('User-ABCD')
  })

  it('gère un uid plus court que 4', () => {
    expect(shortId('ab')).toBe('User-AB')
  })
})
