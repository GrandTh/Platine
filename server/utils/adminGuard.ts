/**
 * Garde des endpoints d'administration (/api/admin/*).
 *
 * Triple barrière, TOUTE côté serveur (le middleware client n'est que confort) :
 *   1. session Supabase valide (serverSupabaseUser = getUser, validé par Supabase),
 *   2. 2FA effective : le token doit être de niveau `aal2` (TOTP vérifié),
 *   3. email présent dans l'allowlist (runtimeConfig.adminEmails).
 *
 * Aucune donnée admin n'est renvoyée sans passer par requireAdmin().
 */
import { serverSupabaseUser, serverSupabaseSession } from '#supabase/server'
import type { H3Event } from 'h3'

/** Décode (sans revérifier la signature — déjà validée par getUser) le payload
 *  d'un JWT pour en lire le claim `aal`. Renvoie null si illisible. */
function readAal(accessToken?: string): string | null {
  if (!accessToken) return null
  const part = accessToken.split('.')[1]
  if (!part) return null
  try {
    const json = Buffer.from(part, 'base64url').toString('utf8')
    return (JSON.parse(json).aal as string | undefined) ?? null
  } catch {
    return null
  }
}

export interface AdminUser { id: string, email: string }

/** Exige un admin authentifié + 2FA (aal2) + email autorisé. Lève 401/403 sinon. */
export async function requireAdmin(event: H3Event): Promise<AdminUser> {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.email) {
    throw createError({ statusCode: 401, statusMessage: 'Authentification requise' })
  }

  // 2FA obligatoire : un simple mot de passe (aal1) ne suffit pas.
  const session = await serverSupabaseSession(event).catch(() => null)
  if (readAal(session?.access_token) !== 'aal2') {
    throw createError({ statusCode: 403, statusMessage: 'Double authentification requise' })
  }

  const allow = (useRuntimeConfig(event).adminEmails || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  if (!allow.includes(user.email.toLowerCase())) {
    throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
  }

  return { id: user.id, email: user.email }
}
