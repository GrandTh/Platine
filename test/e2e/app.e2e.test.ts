import { describe, it, expect } from 'vitest'
import { setup, createPage, $fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'

// E2E : build + serveur Nuxt réels, piloté par un navigateur Playwright.
// Prérequis : navigateur installé (`pnpm exec playwright-core install chromium`)
// et variables Supabase dispo (.env) pour que l'app démarre.
// NB : on utilise les matchers Vitest (pas ceux de @playwright/test) → on
// s'appuie sur les méthodes booléennes de Playwright (count / innerText).
describe('Platine — parcours e2e', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    browser: true,
    // Le build de prod peut dépasser le défaut (120 s) sur une machine chargée.
    setupTimeout: 300_000
  })

  it('la home se charge (SSR contient le wordmark)', async () => {
    const html = await $fetch('/')
    expect(html).toContain('Platine')
  })

  // La langue dépend de la négociation du navigateur (souvent EN) → assertions
  // tolérantes FR/EN.
  it('la home propose Créer / Rejoindre une room', async () => {
    const page = await createPage('/')
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/Créer une room|Create a room/i)
    expect(body).toMatch(/Rejoindre une room|Join a room/i)
    await page.close()
  })

  it('le bouton « Créer une room » ouvre le choix du mode d’écoute', async () => {
    const page = await createPage('/')
    // force:true → un éventuel fond (canvas) ne doit pas bloquer le clic.
    await page.getByRole('button', { name: /Créer une room|Create a room/i }).click({ force: true })
    await page.waitForTimeout(300)
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/Même pièce|Same room/i)
    expect(body).toMatch(/Chacun son ordi|Each on their device/i)
    await page.close()
  })

  it('?tv ouvre directement le mode TV SANS jamais monter la 3D (canvas absent)', async () => {
    const page = await createPage('/room/E2ETV?tv')
    // Bouton de sortie du mode TV présent (rendu dès le SSR via ?tv).
    const exit = page.getByRole('button', { name: /Quitter le mode TV|Exit TV mode/i })
    expect(await exit.count()).toBeGreaterThan(0)
    // La scène 3D (TresCanvas) ne doit jamais être montée en mode TV.
    expect(await page.locator('canvas').count()).toBe(0)
    await page.close()
  })

  it('une room existante sans ?tv monte bien la scène 3D (canvas présent)', async () => {
    // La room doit exister, sinon la page affiche l'écran « room introuvable »
    // (sans 3D). On la crée via l'API avant de la visiter.
    await $fetch('/api/room/ensure', { method: 'POST', body: { roomId: 'E2ENORMAL', uid: 'e2e-host', mode: 'each' } })
    const page = await createPage('/room/E2ENORMAL')
    await page.waitForTimeout(1500) // hydratation + montage TresCanvas
    expect(await page.locator('canvas').count()).toBeGreaterThan(0)
    await page.close()
  })
})
