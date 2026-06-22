import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rateLimitByIp, requireActiveMember } from '../../server/utils/youtubeGuard'

// Les handlers Nitro utilisent des globales auto-importées (getRequestIP,
// createError). On les stub pour tester la logique pure des gardes.
beforeEach(() => {
  vi.stubGlobal('getRequestIP', () => '1.2.3.4')
  vi.stubGlobal('createError', (e: { statusCode: number, statusMessage?: string }) =>
    Object.assign(new Error(e.statusMessage), { statusCode: e.statusCode }))
})

// Mock supabase : chaîne .from().select().eq().eq().gt().maybeSingle()
function memberClient(result: { data: unknown, error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gt']) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(() => Promise.resolve(result))
  return { from: vi.fn(() => chain) } as never
}

describe('requireActiveMember', () => {
  it('rejette (403) si uid manquant', async () => {
    await expect(requireActiveMember(memberClient({ data: null, error: null }), undefined, 'ROOM'))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejette (403) si roomId manquant', async () => {
    await expect(requireActiveMember(memberClient({ data: null, error: null }), 'uid', undefined))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejette (403) si le membre n’est pas trouvé', async () => {
    await expect(requireActiveMember(memberClient({ data: null, error: null }), 'uid', 'ROOM'))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('passe si le membre actif existe', async () => {
    await expect(requireActiveMember(memberClient({ data: { uid: 'uid' }, error: null }), 'uid', 'ROOM'))
      .resolves.toBeUndefined()
  })

  it('fail-open : erreur DB → ne bloque pas', async () => {
    await expect(requireActiveMember(memberClient({ data: null, error: { message: 'db down' } }), 'uid', 'ROOM'))
      .resolves.toBeUndefined()
  })
})

describe('rateLimitByIp', () => {
  const event = {} as never
  const windows = [{ tag: '1m', ttl: 60, limit: 5 }]

  it('rejette (429) quand rl_hit renvoie false', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) } as never
    await expect(rateLimitByIp(event, supabase, 'search', windows))
      .rejects.toMatchObject({ statusCode: 429 })
  })

  it('passe quand rl_hit renvoie true', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) } as never
    await expect(rateLimitByIp(event, supabase, 'search', windows)).resolves.toBeUndefined()
  })

  it('fail-open : rl_hit en erreur (data null) → ne bloque pas', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'no fn' } }) } as never
    await expect(rateLimitByIp(event, supabase, 'search', windows)).resolves.toBeUndefined()
  })

  it('vérifie toutes les fenêtres (rpc appelé une fois par fenêtre)', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) } as never
    await rateLimitByIp(event, supabase, 'track-add', [
      { tag: '1m', ttl: 60, limit: 30 },
      { tag: '1h', ttl: 3600, limit: 200 }
    ])
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })
})
