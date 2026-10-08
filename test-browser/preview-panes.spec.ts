'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { APIRequestContext, Page } from '@playwright/test'

import { storedDocument, storedImage } from './fixtures.ts'

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
  await page.locator('#preview-markup').click()

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
