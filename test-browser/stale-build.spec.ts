'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { violationsOn } from './axe.ts'

const CHOICES = '#file-dialog-choices button'

test('the page says which build it was served, so it can tell when it falls behind', async ({ page }) => {
  await page.goto('/doc/')

  const served = await page.locator('meta[name="vixen-build"]').getAttribute('content')

  expect(served).toMatch(/^[0-9a-f]{64}$/v)
})

test('the warning in the ribbon stays out of the way while the page is current', async ({ page }) => {
  await page.goto('/doc/')

  await expect(page.locator('#stale-build')).toBeHidden()
})

async function warningOpened(page: Page): Promise<void> {
  await page.goto('/doc/')
  await givenAsync(expect(page.locator('#stale-build')).toBeAttached())
  await givenAsync(
    page.evaluate(() => {
      const warning = document.querySelector<HTMLElement>('#stale-build')
      warning?.removeAttribute('hidden')
      warning?.click()
    }),
  )
  await givenAsync(expect(page.locator(CHOICES)).toHaveCount(3))
}

test('the three courses out of being out of date do not look alike', async ({ page }) => {
  await warningOpened(page)

  const backgrounds = await page
    .locator(CHOICES)
    .evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).backgroundColor))

  expect(new Set(backgrounds).size).toBe(3)
})

test('the out-of-date dialog has no accessibility violations, colours and all', async ({ page }) => {
  await warningOpened(page)

  expect(await violationsOn(page)).toStrictEqual([])
})
