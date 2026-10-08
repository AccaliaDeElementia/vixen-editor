'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import type { Page } from '@playwright/test'

import { storedDocument, storedImage } from './fixtures.ts'

const TAB_SELECTOR = '[data-part="tabs"] [role="tab"]'

async function colourOf(page: Page, selector: string): Promise<string> {
  return await page.locator(selector).evaluate((element) => getComputedStyle(element).color)
}

test('a kept tab is still in the strip after a reload', async ({ page, request }) => {
  const stamp = String(Date.now())
  const kept = `kept-${stamp}.md`
  const other = `other-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: other, content: '# other' } })

  await page.goto(await storedDocument(request, kept))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${kept}"]`)).toBeVisible())
  await page.locator(`${TAB_SELECTOR}[data-path="${kept}"]`).dblclick()
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${kept}"]`)).not.toHaveClass(/tabs__tab--looking/v))
  await page.locator(`[role="treeitem"][data-path="${other}"]`).click()
  await givenAsync(expect(page).toHaveURL(`/doc/${other}`))

  await page.reload()

  await expect(page.locator(`${TAB_SELECTOR}[data-path="${kept}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${kept}`)
  await request.delete(`/api/files/entries/${other}`)
})

test('a tab the reader only looked at does not come back after a reload', async ({ page, request }) => {
  const stamp = String(Date.now())
  const looked = `looked-${stamp}.md`
  const other = `elsewhere-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: other, content: '# other' } })

  await page.goto(await storedDocument(request, looked))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${looked}"]`)).toBeVisible())
  await page.locator(`[role="treeitem"][data-path="${other}"]`).click()
  await givenAsync(expect(page).toHaveURL(`/doc/${other}`))

  await page.reload()

  await expect(page.locator(TAB_SELECTOR)).toHaveCount(1)

  await request.delete(`/api/files/entries/${looked}`)
  await request.delete(`/api/files/entries/${other}`)
})

test('a document tab is the colour its file browser row is', async ({ page, request }) => {
  const name = `tinted-${String(Date.now())}.md`
  await page.goto(await storedDocument(request, name))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${name}"] .tabs__icon`)).toBeVisible())

  const onTheTab = await colourOf(page, `${TAB_SELECTOR}[data-path="${name}"] .tabs__icon`)

  expect(onTheTab).toBe(await colourOf(page, `[role="treeitem"][data-path="${name}"] .tree__icon`))
})

test('an image tab is the colour its file browser row is', async ({ page, request }) => {
  const stamp = String(Date.now())
  const picture = `tinted-${stamp}.png`
  await page.goto(await storedImage(request, picture))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${picture}"] .tabs__icon`)).toBeVisible())

  const onTheTab = await colourOf(page, `${TAB_SELECTOR}[data-path="${picture}"] .tabs__icon`)

  expect(onTheTab).toBe(await colourOf(page, `[role="treeitem"][data-path="${picture}"] .tree__icon`))
})

test('a document and an image are not the same colour, so matching the row says something', async ({
  page,
  request,
}) => {
  const stamp = String(Date.now())
  const picture = `paired-${stamp}.png`
  const name = `paired-${stamp}.md`
  await storedImage(request, picture)
  await page.goto(await storedDocument(request, name))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${name}"]`)).toBeVisible())
  await page.locator(`${TAB_SELECTOR}[data-path="${name}"]`).dblclick()
  await page.locator(`[role="treeitem"][data-path="${picture}"]`).dblclick()
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${picture}"] .tabs__icon`)).toBeVisible())

  const onTheImage = await colourOf(page, `${TAB_SELECTOR}[data-path="${picture}"] .tabs__icon`)

  expect(onTheImage).not.toBe(await colourOf(page, `${TAB_SELECTOR}[data-path="${name}"] .tabs__icon`))
})

test('the two previews of one document are not the same colour', async ({ page, request }) => {
  const name = `tinted-preview-${String(Date.now())}.md`
  await page.goto(await storedDocument(request, name))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${name}"]`)).toBeVisible())
  await page.locator(`${TAB_SELECTOR}[data-path="${name}"]`).dblclick()
  await page.locator('#preview-markup').click()
  await page.locator('#preview-source').click()
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-tab="source:${name}"] .tabs__icon`)).toBeVisible())

  const onTheSource = await colourOf(page, `${TAB_SELECTOR}[data-tab="source:${name}"] .tabs__icon`)

  expect(onTheSource).not.toBe(await colourOf(page, `${TAB_SELECTOR}[data-tab="markup:${name}"] .tabs__icon`))
})

test('a preview tab says which view it is in words, not only in its glyph', async ({ page, request }) => {
  const name = `worded-${String(Date.now())}.md`
  await page.goto(await storedDocument(request, name))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${name}"]`)).toBeVisible())
  await page.locator(`${TAB_SELECTOR}[data-path="${name}"]`).dblclick()
  await page.locator('#preview-markup').click()

  const shown = await page
    .locator(`${TAB_SELECTOR}[data-tab="markup:${name}"] .tabs__kind`)
    .evaluate((element) => (element.checkVisibility() ? element.textContent : ''))

  expect(shown).toBe('preview')
})

test('a tab the reader is only looking at is set apart from one they kept', async ({ page, request }) => {
  const stamp = String(Date.now())
  const kept = `held-${stamp}.md`
  const looked = `glanced-${stamp}.md`
  await storedDocument(request, looked)
  await page.goto(await storedDocument(request, kept))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${kept}"]`)).toBeVisible())
  await givenAsync(page.locator(`${TAB_SELECTOR}[data-path="${kept}"]`).dblclick())
  await givenAsync(page.locator(`[role="treeitem"][data-path="${looked}"]`).click())
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${looked}"]`)).toBeVisible())

  const styles = await page
    .locator(TAB_SELECTOR)
    .evaluateAll((tabs) => tabs.map((tab) => getComputedStyle(tab).fontStyle))

  expect(styles).toStrictEqual(['normal', 'italic'])
})

test('opening a document over one you were only looking at says what closed', async ({ page, request }) => {
  const stamp = String(Date.now())
  const looked = `passing-${stamp}.md`
  const next = `next-${stamp}.md`
  await storedDocument(request, next)
  await page.goto(await storedDocument(request, looked))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${looked}"]`)).toBeVisible())

  await page.locator(`[role="treeitem"][data-path="${next}"]`).click()

  await expect(page.locator('#status')).toContainText(`Closed ${looked}`)
})
