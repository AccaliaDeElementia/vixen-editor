'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

const PANE = '.pane'
const DIVIDER = '[data-part="split-resizer"]'

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

test('a share set side by side carries over to above and below', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `carry-${String(Date.now())}.md`))
  await page.locator('#split-beside').click()
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await page.locator(DIVIDER).focus()
  await page.keyboard.press('ArrowLeft')

  await page.locator('#split-below').click()

  const [first, second] = await heights(page)
  expect(first ?? 0).toBeLessThan(second ?? 0)
})

test('a share survives a reload, so a reader sets it once', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `persist-${String(Date.now())}.md`))
  await page.locator('#split-beside').click()
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await page.locator(DIVIDER).focus()
  await page.keyboard.press('ArrowLeft')

  await page.reload()

  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  const [first, second] = await widths(page)
  expect(first ?? 0).toBeLessThan(second ?? 0)
})

test('closing the last tab in the second pane puts the workspace back to one pane', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `undo-${String(Date.now())}.md`))
  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))

  await page.locator(PANE).nth(1).locator('.tabs__close').click()

  await expect(page.locator(PANE)).toHaveCount(1)
})
