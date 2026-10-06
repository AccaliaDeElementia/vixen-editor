'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { EXPLORER, RIBBON, WORKSPACE, boxOf, openLayout } from './fixtures.ts'

test('lays out three full-height columns', async ({ page }) => {
  await openLayout(page)

  const ribbon = await boxOf(page, RIBBON)
  const explorer = await boxOf(page, EXPLORER)
  const workspace = await boxOf(page, WORKSPACE)

  expect({
    heights: [ribbon.height, explorer.height, workspace.height].map(Math.round),
    lefts: [ribbon.x, explorer.x, workspace.x].map(Math.round),
  }).toStrictEqual({
    heights: [700, 700, 700],
    lefts: [0, Math.round(ribbon.width), Math.round(ribbon.width + explorer.width)],
  })
})

test('sizes the ribbon at 4em and the explorer at 20em by default', async ({ page }) => {
  await openLayout(page)

  const rootFontSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize))
  const ribbon = await boxOf(page, RIBBON)
  const explorer = await boxOf(page, EXPLORER)

  expect({ ribbon: Math.round(ribbon.width), explorer: Math.round(explorer.width) }).toStrictEqual({
    ribbon: Math.round(4 * rootFontSize),
    explorer: Math.round(20 * rootFontSize),
  })
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

  const loaded = await page.evaluate(async () => {
    await document.fonts.ready

    return document.fonts.check('24px "Material Symbols Outlined"')
  })

  expect(loaded).toBe(true)
})

test('the navigation arrows are present but disabled until SPA navigation exists', async ({ page }) => {
  await page.goto('/doc/')

  await givenAsync(expect(page.locator('#nav-back')).toBeDisabled())
  await givenAsync(expect(page.locator('#nav-forward')).toBeDisabled())
  await expect(page.locator('#toggle-explorer')).toBeEnabled()
})
