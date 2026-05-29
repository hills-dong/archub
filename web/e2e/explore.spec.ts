import { test, expect } from '@playwright/test'

test('explore lifly: module graph → drill into a module → search a real symbol', async ({ page }) => {
  await page.goto('/')
  // 1) Module overview shows real module server/identity
  const identity = page.getByTestId('graph-node').filter({ hasText: 'server/identity' })
  await expect(identity).toBeVisible({ timeout: 10000 })

  // 2) Drill into server/identity, breadcrumb shows that level
  await identity.click()
  await expect(page.getByTestId('breadcrumb')).toContainText('server/identity', { timeout: 10000 })
  // File-level nodes should include .rs file nodes
  await expect(page.getByTestId('graph-node').filter({ hasText: '.rs' }).first()).toBeVisible({ timeout: 10000 })

  // 3) Search real Rust symbol 'login', pick the login function from service.rs, open detail panel
  // The search hit button text is: "<name> <module> · <kind>"
  // Use /^login\b/ regex to match "login" exactly (not "login_handler", "LoginRequest", etc.)
  await page.getByTestId('search-box').getByRole('textbox').fill('login')
  const loginServiceHit = page.getByTestId('search-hit').filter({ hasText: /^login\b/ })
  await expect(loginServiceHit.first()).toBeVisible({ timeout: 10000 })
  // Pick the login hit from server/identity (service.rs) — filtered by module name in the span
  const loginIdentityHit = loginServiceHit.filter({ hasText: 'server/identity' })
  await expect(loginIdentityHit.first()).toBeVisible({ timeout: 10000 })
  await loginIdentityHit.first().click()
  await expect(page.getByTestId('detail-panel')).toContainText('login', { timeout: 10000 })
  await expect(page.getByTestId('detail-panel')).toContainText('service.rs', { timeout: 10000 })
})
