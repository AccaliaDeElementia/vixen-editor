'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { EXPLORER, WORKSPACE, boxOf, openLayout } from './fixtures.ts'

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

  expect({ widened: wider > before, narrowed: narrower < wider }).toStrictEqual({
    widened: true,
    narrowed: true,
  })
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
  const { width: workspaceBefore } = await boxOf(page, WORKSPACE)

  await page.locator('#toggle-explorer').click()

  await givenAsync(expect(page.locator(EXPLORER)).toBeHidden())
  expect((await boxOf(page, WORKSPACE)).width).toBeGreaterThan(workspaceBefore)
})

test('a resized width survives a reload', async ({ page }) => {
  await openLayout(page)
  await dragResizerTo(page, 600)
  const resized = await explorerWidth(page)

  await page.reload()
  await givenAsync(expect(page.locator('.cm-editor')).toBeVisible())

  expect(await explorerWidth(page)).toBeCloseTo(resized, 0)
})

test('a collapsed explorer survives a reload', async ({ page }) => {
  await openLayout(page)
  await page.locator('#toggle-explorer').click()

  await page.reload()
  await givenAsync(expect(page.locator('.cm-editor')).toBeVisible())

  await givenAsync(expect(page.locator(EXPLORER)).toBeHidden())
  await expect(page.locator('#toggle-explorer')).toHaveAttribute('aria-expanded', 'false')
})

test('a fresh profile with empty storage opens at 20em', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 700 } })
  const fresh = await context.newPage()
  await fresh.goto('/')
  await givenAsync(expect(fresh.locator('.cm-editor')).toBeVisible())

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

  await page.setViewportSize({ width: 1000, height: 700 })
  await page.reload()
  await givenAsync(expect(page.locator('.cm-editor')).toBeVisible())

  expect(await explorerWidth(page)).toBeCloseTo(800, 0)
})
