'use sanity'

import { expect, test } from '@playwright/test'

test('the page says which build it was served, so it can tell when it falls behind', async ({ page }) => {
  await page.goto('/doc/')

  const served = await page.locator('meta[name="vixen-build"]').getAttribute('content')

  expect(served).toMatch(/^[0-9a-f]{64}$/v)
})

test('the warning in the ribbon stays out of the way while the page is current', async ({ page }) => {
  await page.goto('/doc/')

  await expect(page.locator('#stale-build')).toBeHidden()
})
