import { describe, it, expect } from 'vitest'
import { seededRank, sortQueue } from '../../app/utils/queueSort'
import type { QueueTrack } from '../../app/composables/useQueue'

// Fabrique un morceau minimal pour le tri (seuls id, voters, createdAt comptent).
function mk(id: string, voters: string[] = [], createdAt = 0): QueueTrack {
  return {
    id,
    title: id,
    artist: '',
    cover: '',
    source: 'youtube',
    externalId: id,
    addedBy: 'x',
    voters,
    createdAt
  }
}

const ids = (list: QueueTrack[]) => list.map(t => t.id)

describe('seededRank', () => {
  it('est déterministe pour un même (id, seed)', () => {
    expect(seededRank('abc', 's1')).toBe(seededRank('abc', 's1'))
  })

  it('diffère selon le seed', () => {
    expect(seededRank('abc', 's1')).not.toBe(seededRank('abc', 's2'))
  })

  it('diffère selon l’id', () => {
    expect(seededRank('abc', 's1')).not.toBe(seededRank('abd', 's1'))
  })

  it('renvoie un entier non signé', () => {
    const r = seededRank('z', 'seed')
    expect(Number.isInteger(r)).toBe(true)
    expect(r).toBeGreaterThanOrEqual(0)
  })
})

describe('sortQueue', () => {
  it('classe par nombre de votes décroissant', () => {
    const list = [mk('a', []), mk('b', ['u1', 'u2']), mk('c', ['u1'])]
    expect(ids(sortQueue(list, null))).toEqual(['b', 'c', 'a'])
  })

  it('à votes égaux sans shuffle : FIFO (plus ancien d’abord)', () => {
    const list = [mk('new', [], 200), mk('old', [], 100), mk('mid', [], 150)]
    expect(ids(sortQueue(list, null))).toEqual(['old', 'mid', 'new'])
  })

  it('les morceaux votés gardent la priorité sur les 0-vote même avec shuffle', () => {
    const list = [mk('z', [], 0), mk('voted', ['u1'], 999)]
    expect(ids(sortQueue(list, 'seed'))[0]).toBe('voted')
  })

  it('shuffle : même seed → même ordre (déterministe entre clients)', () => {
    const a = [mk('a'), mk('b'), mk('c'), mk('d')]
    const b = [mk('d'), mk('b'), mk('a'), mk('c')] // ordre d’entrée différent
    expect(ids(sortQueue(a, 'seed-1'))).toEqual(ids(sortQueue(b, 'seed-1')))
  })

  it('shuffle : le seed influence l’ordre (plusieurs ordres distincts selon le seed)', () => {
    const base = () => [mk('a'), mk('b'), mk('c'), mk('d'), mk('e')]
    const orders = new Set<string>()
    for (let i = 0; i < 30; i++) orders.add(ids(sortQueue(base(), `seed-${i}`)).join(','))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('n’altère pas le tableau d’entrée (copie)', () => {
    const list = [mk('a', ['u']), mk('b', [])]
    const snapshot = ids(list)
    sortQueue(list, 'seed')
    expect(ids(list)).toEqual(snapshot)
  })

  it('gère la liste vide', () => {
    expect(sortQueue([], 'seed')).toEqual([])
  })
})
