'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Locator, Page } from '@playwright/test'

import { paneAt, storedDocument } from './fixtures.ts'

const DOCUMENT_PANE = 0
const TYPED = 'xyzzy'

function editingBar(page: Page): Locator {
  return paneAt(page, DOCUMENT_PANE).locator('[data-part="controls"]')
}

async function typedInto(page: Page, request: Page['request'], name: string): Promise<void> {
  await page.goto(await storedDocument(request, name, '# heading\n'))
  await givenAsync(expect(page.locator('.cm-content')).toContainText('heading'))
  await page.locator('.cm-content').click()
  await page.keyboard.type(TYPED)
  await givenAsync(expect(page.locator('.cm-content')).toContainText(TYPED))
}

test('the undo control takes back what was typed, so a touch-only reader can undo', async ({ page, request }) => {
  await typedInto(page, request, `undone-${String(Date.now())}.md`)

  await editingBar(page).locator('[data-part="edit-undo"]').click()

  await expect(page.locator('.cm-content')).not.toContainText(TYPED)
})

test('the redo control puts back what undo took away', async ({ page, request }) => {
  await typedInto(page, request, `redone-${String(Date.now())}.md`)
  await givenAsync(editingBar(page).locator('[data-part="edit-undo"]').click())
  await givenAsync(expect(page.locator('.cm-content')).not.toContainText(TYPED))

  await editingBar(page).locator('[data-part="edit-redo"]').click()

  await expect(page.locator('.cm-content')).toContainText(TYPED)
})

test('the editor takes the focus back, so typing carries on after an undo', async ({ page, request }) => {
  await typedInto(page, request, `focused-${String(Date.now())}.md`)

  await editingBar(page).locator('[data-part="edit-undo"]').click()

  await expect(page.locator('.cm-content')).toBeFocused()
})
