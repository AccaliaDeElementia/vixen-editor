'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

import { openLayout } from './fixtures.ts'

test('widening a narrow viewport brings the explorer back', async ({ page }) => {
  await openLayout(page, 1400, 800)
  await givenAsync(expect(page.locator('#app')).toHaveAttribute('data-explorer', 'open'))

  await page.setViewportSize({ width: 800, height: 800 })
  await givenAsync(expect(page.locator('#app')).toHaveAttribute('data-explorer', 'closed'))

  await page.setViewportSize({ width: 1400, height: 800 })
  await expect(page.locator('#app')).toHaveAttribute('data-explorer', 'open')
})

test('an explorer opened by hand on a narrow viewport is left open', async ({ page }) => {
  await openLayout(page, 800, 800)
  await givenAsync(expect(page.locator('#app')).toHaveAttribute('data-explorer', 'closed'))

  await page.locator('#toggle-explorer').click()
  await givenAsync(expect(page.locator('#app')).toHaveAttribute('data-explorer', 'open'))

  await page.setViewportSize({ width: 820, height: 800 })
  await expect(page.locator('#app')).toHaveAttribute('data-explorer', 'open')
})

test('an explorer closed by hand is not reopened by widening', async ({ page }) => {
  await openLayout(page, 1400, 800)
  await page.locator('#toggle-explorer').click()
  await givenAsync(expect(page.locator('#app')).toHaveAttribute('data-explorer', 'closed'))

  await page.setViewportSize({ width: 1500, height: 800 })
  await expect(page.locator('#app')).toHaveAttribute('data-explorer', 'closed')
})

test('stays collapsed through a second render at the same width', async ({ page }) => {
  await openLayout(page, 800, 800)
  await givenAsync(expect(page.locator('#app')).toHaveAttribute('data-explorer', 'closed'))

  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'))
  })

  await expect(page.locator('#app')).toHaveAttribute('data-explorer', 'closed')
})

test('a reader who opens it on a narrow viewport keeps it through a re-render', async ({ page }) => {
  await openLayout(page, 800, 800)
  await page.locator('#toggle-explorer').click()
  await givenAsync(expect(page.locator('#app')).toHaveAttribute('data-explorer', 'open'))

  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'))
  })

  await expect(page.locator('#app')).toHaveAttribute('data-explorer', 'open')
})
