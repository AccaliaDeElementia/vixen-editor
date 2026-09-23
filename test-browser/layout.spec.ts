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
  await page.goto('/doc/')
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
  await page.goto('/doc/')
  await page.waitForFunction(() => document.fonts.status === 'loaded')

  const loaded = await page.evaluate(() => document.fonts.check('24px "Material Symbols Outlined"'))

  expect(loaded).toBe(true)
})

test('the navigation arrows are present but disabled until SPA navigation exists', async ({ page }) => {
  await page.goto('/doc/')

  await expect(page.locator('#nav-back')).toBeDisabled()
  await expect(page.locator('#nav-forward')).toBeDisabled()
  await expect(page.locator('#toggle-explorer')).toBeEnabled()
})

test('the file browser placeholder is listed', async ({ page }) => {
  await page.goto('/doc/')

  const items = page.locator('.explorer__list li')
  expect(await items.count()).toBeGreaterThan(1)
  await expect(items.first()).toHaveText('TODO: Implement File Browser')
})

test('saving surfaces a toast that then fades', async ({ page }) => {
  await page.goto(`/doc/toast-${String(Date.now())}.md`)
  await expect(page.locator('.cm-editor')).toBeVisible()

  const status = page.locator('#status')
  await expect(status).toHaveAttribute('data-visible', 'true')
  await expect(status).toContainText('Editing')

  await expect(status).toHaveAttribute('data-visible', 'false', { timeout: 5000 })
})

async function explorerWidth(page: Page): Promise<number> {
  return (await boxOf(page, EXPLORER)).width
}

async function dragResizerTo(page: Page, clientX: number): Promise<void> {
  const handle = await boxOf(page, '#explorer-resizer')
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(clientX, handle.y + handle.height / 2, { steps: 8 })
  await page.mouse.up()
}

test('dragging the resizer widens and narrows the explorer', async ({ page }) => {
  await openLayout(page)
  const before = await explorerWidth(page)

  await dragResizerTo(page, 600)
  const wider = await explorerWidth(page)

  await dragResizerTo(page, 300)
  const narrower = await explorerWidth(page)

  expect(wider).toBeGreaterThan(before)
  expect(narrower).toBeLessThan(wider)
})

test('dragging past 80% of the viewport caps the explorer', async ({ page }) => {
  await openLayout(page, 1000, 700)

  await dragResizerTo(page, 990)

  expect(await explorerWidth(page)).toBeCloseTo(800, 0)
})

test('dragging below the minimum floors the explorer', async ({ page }) => {
  await openLayout(page)

  await dragResizerTo(page, 70)

  expect(await explorerWidth(page)).toBeCloseTo(160, 0)
})

test('the toggle collapses the explorer and the editor reclaims the space', async ({ page }) => {
  await openLayout(page)
  const workspaceBefore = (await boxOf(page, WORKSPACE)).width

  await page.locator('#toggle-explorer').click()

  await expect(page.locator(EXPLORER)).toBeHidden()
  expect((await boxOf(page, WORKSPACE)).width).toBeGreaterThan(workspaceBefore)
})

test('a resized width survives a reload', async ({ page }) => {
  await openLayout(page)
  await dragResizerTo(page, 600)
  const resized = await explorerWidth(page)

  await page.reload()
  await expect(page.locator('.cm-editor')).toBeVisible()

  expect(await explorerWidth(page)).toBeCloseTo(resized, 0)
})

test('a collapsed explorer survives a reload', async ({ page }) => {
  await openLayout(page)
  await page.locator('#toggle-explorer').click()

  await page.reload()
  await expect(page.locator('.cm-editor')).toBeVisible()

  await expect(page.locator(EXPLORER)).toBeHidden()
  await expect(page.locator('#toggle-explorer')).toHaveAttribute('aria-expanded', 'false')
})

test('a fresh profile with empty storage opens at 20em', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 700 } })
  const fresh = await context.newPage()
  await fresh.goto('/')
  await expect(fresh.locator('.cm-editor')).toBeVisible()

  const rootFontSize = await fresh.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize))
  const box = await fresh.locator(EXPLORER).boundingBox()

  expect(box?.width).toBeCloseTo(20 * rootFontSize, 0)
  await context.close()
})

test('a width stored wider than the viewport is clamped on load', async ({ page }) => {
  await openLayout(page, 1200, 700)
  await page.evaluate(() => {
    localStorage.setItem('vixen-editor:explorer', JSON.stringify({ widthPx: 5000, open: true }))
  })

  await page.setViewportSize({ width: 800, height: 700 })
  await page.reload()
  await expect(page.locator('.cm-editor')).toBeVisible()

  expect(await explorerWidth(page)).toBeCloseTo(640, 0)
})
