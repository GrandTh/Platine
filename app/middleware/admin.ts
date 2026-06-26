/**
 * Middleware des pages /admin (sauf /admin/login) : confort UX uniquement.
 * Redirige vers la connexion si pas de session ou 2FA non franchie (aal2).
 *
 * ⚠️ La VRAIE sécurité est côté serveur (requireAdmin sur /api/admin/*). Ce
 * middleware évite juste d'afficher une coquille vide à un non-connecté.
 */
export default defineNuxtRouteMiddleware(async () => {
  // Le check 2FA passe par l'API MFA (client). On laisse passer le SSR : les
  // endpoints de données refuseront de toute façon un non-admin.
  if (import.meta.server) return

  const user = useSupabaseUser()
  if (!user.value) return navigateTo('/admin/login')

  const supabase = useSupabaseClient()
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (data?.currentLevel !== 'aal2') return navigateTo('/admin/login')
})
