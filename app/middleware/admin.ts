/**
 * Middleware des pages /admin (sauf /admin/login). Tourne en SSR **et** client :
 * la redirection se fait donc côté serveur → pas de flash du dashboard ni de
 * swap de page client (qui cassait le centrage du login), et /admin/login se
 * charge toujours frais.
 *
 * ⚠️ Reste un garde de confort : la VRAIE sécurité est serveur (requireAdmin sur
 * /api/admin/*). On lit ici le claim `aal` de la session (2FA franchie = aal2)
 * sans appeler l'API MFA (client-only).
 */
function aalOf(token?: string | null): string | null {
  if (!token) return null
  const part = token.split('.')[1]
  if (!part) return null
  try {
    // atob est dispo côté navigateur ET Node (Nitro) → pas de Buffer dans le bundle.
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(json).aal as string | undefined) ?? null
  } catch {
    return null
  }
}

export default defineNuxtRouteMiddleware(() => {
  const user = useSupabaseUser()
  if (!user.value) return navigateTo('/admin/login')

  const session = useSupabaseSession()
  if (aalOf(session.value?.access_token) !== 'aal2') return navigateTo('/admin/login')
})
