'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

const A_VERY_LONG_NAME = [
  'a name so long that it cannot possibly fit inside the row the layout gives it',
  'not at any width a reader would ever choose to make their window',
  'and still leaving room for the controls beside it',
].join(' ')
const A_HAIR = 1

async function clipped(page: Page, selector: string): Promise<boolean> {
  return await page
    .locator(selector)
    .first()
    .evaluate((element) => element.scrollWidth > element.clientWidth)
}

async function heightOf(page: Page, selector: string): Promise<number> {
  return await page
    .locator(selector)
    .first()
    .evaluate((element) => element.getBoundingClientRect().height)
}

test('a tab with a very long name keeps its close button inside the tab', async ({ page, request }) => {
  const name = `${A_VERY_LONG_NAME} ${String(Date.now())}.md`
  await page.goto(await storedDocument(request, name))
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())

  const overhang = await page.locator(`[data-tab="editor:${name}"]`).evaluate((tab) => {
    const closer = tab.querySelector('.tabs__close')

    return closer === null ? Number.NaN : closer.getBoundingClientRect().right - tab.getBoundingClientRect().right
  })

  expect(overhang).toBeLessThanOrEqual(A_HAIR)
})

test('a tab with a very long name clips it rather than letting it push the row wider', async ({ page, request }) => {
  const name = `${A_VERY_LONG_NAME} ${String(Date.now())}.md`
  await page.goto(await storedDocument(request, name))
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())

  expect(await clipped(page, `[data-tab="editor:${name}"] .tabs__name`)).toBe(true)
})

test('a file browser row with a very long name stays one line tall', async ({ page, request }) => {
  const stamp = String(Date.now())
  const short = `s-${stamp}.md`
  await storedDocument(request, short)
  const name = `${A_VERY_LONG_NAME} ${stamp}.md`
  await page.goto(await storedDocument(request, name))
  await givenAsync(expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible())

  const [tall, plain] = await Promise.all([
    heightOf(page, `.tree__row[data-path="${name}"]`),
    heightOf(page, `.tree__row[data-path="${short}"]`),
  ])

  expect(tall).toBe(plain)
})
