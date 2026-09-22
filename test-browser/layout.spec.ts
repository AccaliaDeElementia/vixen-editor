'use sanity'

import { expect, test, type Page } from '@playwright/test'

const RIBBON = '.ribbon'
const EXPLORER = '#explorer'
const WORKSPACE = '.workspace'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const found = await page.locator(selector).boundingBox()
  expect(found, `${selector} should be laid out`).not.toBeNull()
  return found as Box
}

async function openLayout(page: Page, width = 1200, height = 700): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await expect(page.locator('.cm-editor')).toBeVisible()
}

test('lays out three full-height columns', async ({ page }) => {
  await openLayout(page)

  const ribbon = await boxOf(page, RIBBON)
  const explorer = await boxOf(page, EXPLORER)
  const workspace = await boxOf(page, WORKSPACE)

  expect(ribbon.height).toBeCloseTo(700, 0)
  expect(explorer.height).toBeCloseTo(700, 0)
  expect(workspace.height).toBeCloseTo(700, 0)

  // The columns tile the viewport left to right with no gaps.
  expect(ribbon.x).toBeCloseTo(0, 0)
  expect(explorer.x).toBeCloseTo(ribbon.width, 0)
  expect(workspace.x).toBeCloseTo(ribbon.width + explorer.width, 0)
})

test('sizes the ribbon at 4em and the explorer at 20em by default', async ({ page }) => {
  await openLayout(page)

  const rootFontSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize))
  const ribbon = await boxOf(page, RIBBON)
  const explorer = await boxOf(page, EXPLORER)

  expect(ribbon.width).toBeCloseTo(4 * rootFontSize, 0)
  expect(explorer.width).toBeCloseTo(20 * rootFontSize, 0)
})

test('the editor column takes the remaining width', async ({ page }) => {
  await openLayout(page)

  const ribbon = await boxOf(page, RIBBON)
  const explorer = await boxOf(page, EXPLORER)
  const workspace = await boxOf(page, WORKSPACE)

  expect(workspace.width + ribbon.width + explorer.width).toBeCloseTo(1200, 0)
})

test('the page itself never scrolls', async ({ page }) => {
  await openLayout(page)

  const overflowing = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  )

  expect(overflowing).toBe(false)
})

test('the icon font actually loads, so buttons show glyphs and not their names', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => document.fonts.status === 'loaded')

  const loaded = await page.evaluate(() => document.fonts.check('24px "Material Symbols Outlined"'))

  expect(loaded).toBe(true)
})

test('the navigation arrows are present but disabled until SPA navigation exists', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('#nav-back')).toBeDisabled()
  await expect(page.locator('#nav-forward')).toBeDisabled()
  await expect(page.locator('#toggle-explorer')).toBeEnabled()
})

test('the file browser placeholder is listed', async ({ page }) => {
  await page.goto('/')

  const items = page.locator('.explorer__list li')
  expect(await items.count()).toBeGreaterThan(1)
  await expect(items.first()).toHaveText('TODO: Implement File Browser')
})

test('saving surfaces a toast that then fades', async ({ page }) => {
  await page.goto(`/?doc=toast-${String(Date.now())}.md`)
  await expect(page.locator('.cm-editor')).toBeVisible()

  const status = page.locator('#status')
  await expect(status).toHaveAttribute('data-visible', 'true')
  await expect(status).toContainText('Editing')

  await expect(status).toHaveAttribute('data-visible', 'false', { timeout: 5000 })
})
