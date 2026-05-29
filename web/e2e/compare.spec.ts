import { test, expect } from '@playwright/test'

test('compare mode: switch to compare, diff a snapshot vs working tree, see the report', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('mode-compare').click()
  await expect(page.getByTestId('compare-controls')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('base-select')).toBeVisible()
  await expect(page.getByTestId('head-select')).toBeVisible()
  // 报告面板出现 (base=刚建的快照 HEAD, head=WORKING；同源 → 无变化)
  await expect(page.getByTestId('diff-report')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('diff-report')).toContainText('+0 / -0 节点')
})
