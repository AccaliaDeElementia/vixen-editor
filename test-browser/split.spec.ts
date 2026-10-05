'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test, type Page } from '@playwright/test'

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

test('the source preview opens beside the editor and shows the markup', async ({ page, request }) => {
  const name = `source-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# A heading\n\nA **bold** word' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await page.locator('#preview-source').click()

  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await expect(page.locator('[data-part="source-body"]').last()).toContainText('A **bold** word')

  await request.delete(`/api/files/entries/${name}`)
})

test('the source preview highlights the markup rather than rendering it', async ({ page, request }) => {
  const name = `highlit-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# A heading' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await page.locator('#preview-source').click()

  await expect(page.locator('[data-part="source-body"]').last().locator('span').first()).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('Alt+Shift+P reaches the source preview', async ({ page, request }) => {
  const name = `keyed-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# keyed' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('keyed'))

  await page.keyboard.press('Alt+Shift+P')

  await expect(page.locator(PANE)).toHaveCount(2)

  await request.delete(`/api/files/entries/${name}`)
})
