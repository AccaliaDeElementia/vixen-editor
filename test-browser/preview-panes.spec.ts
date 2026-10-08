'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { APIRequestContext, Page } from '@playwright/test'

import { previewControl, storedDocument, storedImage } from './fixtures.ts'

const PRIMARY = 0
const ASIDE = 1

async function previewingADocumentHeldAside(page: Page, request: APIRequestContext, stamp: string): Promise<string> {
  const image = `held-${stamp}.png`
  const doc = `doc-${stamp}.md`
  await storedImage(request, image)
  await storedDocument(request, doc, '# heading\n\nwords here')

  await page.goto(`/doc/${image}`)
  await givenAsync(expect(page.locator(`.tree__row[data-path="${doc}"]`)).toBeVisible())
  await page.locator(`.tree__row[data-path="${doc}"]`).click({ modifiers: ['ControlOrMeta'] })
  await givenAsync(expect(page.locator('.pane')).toHaveCount(2))
  await page.locator('.pane').nth(ASIDE).locator(`[data-tab="editor:${doc}"]`).dblclick()
  await previewControl(page, 'markup', ASIDE).click()

  return doc
}

test('previewing a document held aside paints the preview in the other pane', async ({ page, request }) => {
  await previewingADocumentHeldAside(page, request, String(Date.now()))

  await expect(page.locator('.pane').nth(PRIMARY).locator('[data-part="markup-body"]')).toContainText('heading')
})

test('previewing a document held aside leaves its editor where the reader had it', async ({ page, request }) => {
  const doc = await previewingADocumentHeldAside(page, request, String(Date.now()))

  await expect(page.locator('.pane').nth(ASIDE).locator(`[data-tab="editor:${doc}"]`)).toBeVisible()
})

test('that arrangement survives a reload, with neither pane taking the other over', async ({ page, request }) => {
  const doc = await previewingADocumentHeldAside(page, request, String(Date.now()))
  await givenAsync(
    expect(page.locator('.pane').nth(PRIMARY).locator('[data-part="markup-body"]')).toContainText('heading'),
  )

  await page.reload()

  await expect(page.locator('.pane').nth(ASIDE).locator(`[data-tab="editor:${doc}"]`)).toBeVisible()
})

async function bothTabsHeldAside(page: Page, request: APIRequestContext, stamp: string): Promise<string> {
  const doc = await previewingADocumentHeldAside(page, request, stamp)
  const aside = page.locator('.pane').nth(ASIDE)
  await givenAsync(
    expect(page.locator('.pane').nth(PRIMARY).locator('[data-part="markup-body"]')).toContainText('heading'),
  )
  await givenAsync(page.locator('.pane').nth(PRIMARY).locator(`[data-tab="markup:${doc}"]`).click())
  await givenAsync(page.keyboard.press('Control+Alt+Shift+ArrowRight'))
  await givenAsync(expect(aside.locator(`[data-tab="markup:${doc}"]`)).toBeVisible())

  return doc
}

test('switching to a preview tab beside its editor hides that editor, rather than halving the pane', async ({
  page,
  request,
}) => {
  const doc = await bothTabsHeldAside(page, request, String(Date.now()))
  const aside = page.locator('.pane').nth(ASIDE)
  await givenAsync(aside.locator(`[data-tab="editor:${doc}"]`).click())
  await givenAsync(expect(aside.locator('.cm-editor')).toBeVisible())

  await aside.locator(`[data-tab="markup:${doc}"]`).click()

  await expect(aside.locator('[data-part="editor"]')).toBeHidden()
})

test('typing after leaving a preview tab does not bring that preview back over the editor', async ({
  page,
  request,
}) => {
  const doc = await bothTabsHeldAside(page, request, String(Date.now()))
  const aside = page.locator('.pane').nth(ASIDE)
  await givenAsync(aside.locator(`[data-tab="markup:${doc}"]`).click())
  await givenAsync(expect(aside.locator('[data-part="markup-body"]')).toContainText('heading'))
  await givenAsync(aside.locator(`[data-tab="editor:${doc}"]`).click())
  await givenAsync(expect(aside.locator('.cm-editor')).toBeVisible())

  await aside.locator('.cm-content').pressSequentially('typed')

  await givenAsync(expect(aside.locator('[data-part="markup-body"]')).toContainText('typed'))

  await expect(aside.locator('[data-part="view-markup"]')).toBeHidden()
})
