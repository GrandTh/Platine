import { describe, it, expect } from 'vitest'
import { skipQuorum } from '../../app/utils/skipQuorum'

describe('skipQuorum', () => {
  it('minimum 1, même room vide ou à 1', () => {
    expect(skipQuorum(0)).toBe(1)
    expect(skipQuorum(1)).toBe(1)
    expect(skipQuorum(2)).toBe(1)
  })

  it('arrondit au supérieur (50 %)', () => {
    expect(skipQuorum(3)).toBe(2) // 1 hôte + 2 invités
    expect(skipQuorum(4)).toBe(2)
    expect(skipQuorum(5)).toBe(3)
    expect(skipQuorum(10)).toBe(5)
    expect(skipQuorum(11)).toBe(6)
  })
})
