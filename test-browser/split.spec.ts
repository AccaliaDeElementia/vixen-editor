'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { APIRequestContext, Page } from '@playwright/test'

import { previewControl, storedDocument } from './fixtures.ts'

const PANE = '.pane'
const DIVIDER = '[data-part="split-resizer"]'
const EVEN_ENOUGH = 2

async function widths(page: Page): Promise<number[]> {
  return await page.locator(PANE).evaluateAll((panes) => panes.map((pane) => pane.getBoundingClientRect().width))
}

async function heights(page: Page): Promise<number[]> {
  return await page.locator(PANE).evaluateAll((panes) => panes.map((pane) => pane.getBoundingClientRect().height))
}

test('a workspace starts with one pane', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `single-${String(Date.now())}.md`))

  await expect(page.locator(PANE)).toHaveCount(1)
})

test('splitting side by side gives each pane half the width', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `beside-${String(Date.now())}.md`))

  await page.locator('#split-beside').click()

  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  const [first, second] = await widths(page)
  expect(Math.abs((first ?? 0) - (second ?? 0))).toBeLessThan(2)
})

test('splitting above and below gives each pane half the height', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `below-${String(Date.now())}.md`))

  await page.locator('#split-below').click()

  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  const [first, second] = await heights(page)
  expect(Math.abs((first ?? 0) - (second ?? 0))).toBeLessThan(2)
})

test('pressing the same control again returns to one pane', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `unsplit-${String(Date.now())}.md`))
  await page.locator('#split-beside').click()
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))

  await page.locator('#split-beside').click()

  await expect(page.locator(PANE)).toHaveCount(1)
})

test('dragging the divider moves the share, and the keyboard reaches it too', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `drag-${String(Date.now())}.md`))
  await page.locator('#split-beside').click()
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))

  await page.locator(DIVIDER).focus()
  await page.keyboard.press('ArrowLeft')

  const [first, second] = await widths(page)
  expect(first ?? 0).toBeLessThan(second ?? 0)
})

test('a share set side by side leaves above and below even, because each keeps its own', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `carry-${String(Date.now())}.md`))
  await page.locator('#split-beside').click()
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await page.locator(DIVIDER).focus()
  await page.keyboard.press('ArrowLeft')

  await page.locator('#split-below').click()

  const [first, second] = await heights(page)
  expect(Math.abs((first ?? 0) - (second ?? 0))).toBeLessThan(EVEN_ENOUGH)
})

test('a share set side by side comes back when the reader returns to it', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `back-${String(Date.now())}.md`))
  await page.locator('#split-beside').click()
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await page.locator(DIVIDER).focus()
  await page.keyboard.press('ArrowLeft')
  await page.locator('#split-below').click()

  await page.locator('#split-beside').click()

  const [first, second] = await widths(page)
  expect(first ?? 0).toBeLessThan(second ?? 0)
})

test('a share survives a reload of a split that is still live, so a reader sets it once', async ({ page, request }) => {
  const name = `persist-${String(Date.now())}.md`
  await page.goto(await storedDocument(request, name))
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await page.locator(PANE).nth(1).locator(`[data-tab="markup:${name}"]`).dblclick()
  await page.locator(DIVIDER).focus()
  await page.keyboard.press('ArrowLeft')

  await page.reload()

  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  const [first, second] = await widths(page)
  expect(first ?? 0).toBeLessThan(second ?? 0)
})

test('a share goes back to even once the second pane has gone, however it went', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `even-${String(Date.now())}.md`))
  await page.locator('#split-beside').click()
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await page.locator(DIVIDER).focus()
  await page.keyboard.press('ArrowLeft')

  await page.reload()
  await page.locator('#split-beside').click()

  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  const [first, second] = await widths(page)
  expect(Math.abs((first ?? 0) - (second ?? 0))).toBeLessThan(EVEN_ENOUGH)
})

test('closing the last tab in the second pane puts the workspace back to one pane', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `undo-${String(Date.now())}.md`))
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))

  await page.locator(PANE).nth(1).locator('.tabs__close').click()

  await expect(page.locator(PANE)).toHaveCount(1)
})

test('a pane opened by the split control is wired up, not just drawn', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `wired-${String(Date.now())}.md`))

  await page.locator('#split-beside').click()

  await expect(page.locator(PANE).nth(1).locator('[role="tablist"]')).toBeAttached()
})

test('the second pane strip comes back as tall as the first after a reload', async ({ page, request }) => {
  const stamp = String(Date.now())
  await storedDocument(request, `tallaside-${stamp}.md`)
  await page.goto(await storedDocument(request, `tallhome-${stamp}.md`))
  await givenAsync(expect(page.locator(`.tree__row[data-path="tallaside-${stamp}.md"]`)).toBeVisible())
  await page.locator(`.tree__row[data-path="tallaside-${stamp}.md"]`).click({ modifiers: ['ControlOrMeta'] })
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await page.locator(PANE).nth(1).locator(`[data-tab="editor:tallaside-${stamp}.md"]`).dblclick()
  await page.locator(PANE).nth(0).locator(`[data-tab="editor:tallhome-${stamp}.md"]`).dblclick()

  await page.reload()

  await givenAsync(expect(page.locator(PANE).nth(1).locator('[role="tablist"]')).toBeVisible())
  const strips = await page
    .locator(PANE)
    .locator('[data-part="tabs"]')
    .evaluateAll((found) => found.map((strip) => strip.getBoundingClientRect().height))
  expect(strips[0]).toBe(strips[1])
})

async function dismissedWithTabsAside(page: Page, request: APIRequestContext, stamp: string): Promise<string> {
  const aside = `aside-${stamp}.md`
  await storedDocument(request, aside)
  await page.goto(await storedDocument(request, `home-${stamp}.md`))
  await givenAsync(expect(page.locator(`.tree__row[data-path="${aside}"]`)).toBeVisible())
  await page.locator(`.tree__row[data-path="${aside}"]`).click({ modifiers: ['ControlOrMeta'] })
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await page.locator('#split-beside').click()

  return aside
}

test('dismissing a pane that holds tabs leaves one pane', async ({ page, request }) => {
  await dismissedWithTabsAside(page, request, String(Date.now()))

  await expect(page.locator(PANE)).toHaveCount(1)
})

test('dismissing a pane that holds tabs brings them to the one that survives', async ({ page, request }) => {
  const aside = await dismissedWithTabsAside(page, request, String(Date.now()))

  await expect(page.locator(PANE).first().locator(`[data-tab="editor:${aside}"]`)).toBeVisible()
})
