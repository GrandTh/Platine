/**
 * Garde des endpoints d'administration (/api/admin/*).
 *
 * Triple barrière, TOUTE côté serveur (le middleware client n'est que confort),
 * et **fail-closed** (toute anomalie → refus) :
 *   1. session Supabase valide : serverSupabaseUser = getClaims() qui VÉRIFIE le
 *      JWT (signature + expiration) → un token forgé/expiré est rejeté (401) ;
 *   2. 2FA effective : claim `aal === 'aal2'` (TOTP vérifié), sinon 403 ;
 *   3. email présent dans l'allowlist (runtimeConfig.adminEmails), sinon 403.
 *      Allowlist vide → personne ne passe (fail-closed).
 *
 * Aucune donnée admin n'est renvoyée sans passer par requireAdmin().
 */
import { serverSupabaseUser } from '#supabase/server'
import type { H3Event } from 'h3'

export interface AdminUser { id: string, email: string }

export async function requireAdmin(event: H3Event): Promise<AdminUser> {
  // Claims du JWT VALIDÉ (getClaims vérifie signature + expiration).
  const claims = await serverSupabaseUser(event).catch(() => null) as
    | { sub?: string, email?: string, aal?: string }
    | null

  if (!claims?.email) {
    throw createError({ statusCode: 401, statusMessage: 'Authentification requise' })
  }
  // 2FA obligatoire : un simple mot de passe (aal1) ne suffit pas.
  if (claims.aal !== 'aal2') {
    throw createError({ statusCode: 403, statusMessage: 'Double authentification requise' })
  }
  // Allowlist (vide → refus).
  const allow = (useRuntimeConfig(event).adminEmails || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  if (!allow.includes(claims.email.toLowerCase())) {
    throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
  }

  return { id: claims.sub ?? '', email: claims.email }
}
