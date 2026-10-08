'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { APIRequestContext, Locator, Page } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

const ASIDE = 1
const BLOCKS = 40
const NOT_SCROLLED = 0

function aLongDocument(): string {
  return Array.from(
    { length: BLOCKS },
    (_unused, at) => `## Heading ${String(at)}\n\nSome prose under heading ${String(at)}.`,
  ).join('\n\n')
}

async function previewing(page: Page, request: APIRequestContext, control: string): Promise<Locator> {
  const name = `reading-${String(Date.now())}-${control}.md`
  await page.goto(await storedDocument(request, name, aLongDocument()))
  await givenAsync(expect(page.locator('.cm-content')).toContainText('Heading 0'))
  await page.locator(`#preview-${control}`).click()

  return page.locator('.pane').nth(ASIDE)
}

async function scrolledToTheEnd(body: Locator): Promise<number> {
  return await body.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight })

    return element.scrollTop
  })
}

test('a rendered preview longer than its pane scrolls, so the end of it can be read', async ({ page, request }) => {
  const aside = await previewing(page, request, 'markup')
  const body = aside.locator('[data-part="markup-body"]')
  await givenAsync(expect(body).toContainText('Heading 0'))

  const reached = await scrolledToTheEnd(body)

  expect(reached).toBeGreaterThan(NOT_SCROLLED)
})

test('a source preview longer than its pane scrolls too', async ({ page, request }) => {
  const aside = await previewing(page, request, 'source')
  await givenAsync(expect(aside.locator('[data-part="source-body"]')).toContainText('Heading 0'))

  const reached = await scrolledToTheEnd(aside.locator('.source'))

  expect(reached).toBeGreaterThan(NOT_SCROLLED)
})

test('following the caret scrolls the preview, leaving the pane around it where it was', async ({ page, request }) => {
  const aside = await previewing(page, request, 'markup')
  const body = aside.locator('[data-part="markup-body"]')
  await givenAsync(expect(body.locator('h2').first()).toBeVisible())

  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')

  await givenAsync(
    expect.poll(async () => await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(NOT_SCROLLED),
  )
  expect(await aside.evaluate((element) => element.scrollTop)).toBe(NOT_SCROLLED)
})
