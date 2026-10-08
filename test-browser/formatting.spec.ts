'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Locator, Page } from '@playwright/test'

import { paneAt, previewControl, storedDocument } from './fixtures.ts'

const WORD = 'word'
const INSIDE_THE_WORD = { x: 20, y: 8 }
const GAP_PX = 100

const DOCUMENT_PANE = 0
const PREVIEW_PANE = 1

function editingBar(page: Page): Locator {
  return paneAt(page, DOCUMENT_PANE).locator('[data-part="controls"]')
}

async function selectingTheWord(page: Page, request: Page['request'], content: string): Promise<void> {
  const name = `format-${String(Date.now())}-${String(Math.random()).slice(2)}.md`
  await page.goto(await storedDocument(request, name, content))
  await givenAsync(expect(page.locator('.cm-content')).toContainText(WORD))
  await givenAsync(page.locator('.cm-line').first().dblclick({ position: INSIDE_THE_WORD }))
  await givenAsync(expect(page.locator('.cm-content')).toBeFocused())
}

test('a control wraps the selected word in the mark it names', async ({ page, request }) => {
  await selectingTheWord(page, request, 'word')

  await editingBar(page).locator('[data-part="format-bold"]').click()

  await expect(page.locator('.cm-content')).toHaveText('**word**')
})

test('pressing it again takes the mark off, so the control is its own way back', async ({ page, request }) => {
  await selectingTheWord(page, request, 'word')
  await givenAsync(editingBar(page).locator('[data-part="format-bold"]').click())
  await givenAsync(expect(page.locator('.cm-content')).toHaveText('**word**'))

  await editingBar(page).locator('[data-part="format-bold"]').click()

  await expect(page.locator('.cm-content')).toHaveText('word')
})

test('a link takes the selection as its label', async ({ page, request }) => {
  await selectingTheWord(page, request, 'word')

  await editingBar(page).locator('[data-part="format-link"]').click()

  await expect(page.locator('.cm-content')).toHaveText('[word]()')
})

test('one press is one undo, so a reader takes it back the way they take back typing', async ({ page, request }) => {
  await selectingTheWord(page, request, 'word')
  await givenAsync(editingBar(page).locator('[data-part="format-bold"]').click())
  await givenAsync(expect(page.locator('.cm-content')).toHaveText('**word**'))

  await page.keyboard.press('ControlOrMeta+z')

  await expect(page.locator('.cm-content')).toHaveText('word')
})

test('the chord a reader knows from other editors does what the control does', async ({ page, request }) => {
  await selectingTheWord(page, request, 'word')

  await page.keyboard.press('ControlOrMeta+b')

  await expect(page.locator('.cm-content')).toHaveText('**word**')
})

test('the italic chord uses an underscore, so it nests inside bold rather than cancelling it', async ({
  page,
  request,
}) => {
  await selectingTheWord(page, request, 'word')
  await givenAsync(page.keyboard.press('ControlOrMeta+b'))
  await givenAsync(expect(page.locator('.cm-content')).toHaveText('**word**'))

  await page.keyboard.press('ControlOrMeta+i')

  await expect(page.locator('.cm-content')).toHaveText('**_word_**')
})

test('the pane showing a preview carries no editing bar, because there is nothing there to format', async ({
  page,
  request,
}) => {
  await selectingTheWord(page, request, 'word')
  await givenAsync(previewControl(page, 'markup').click())
  await givenAsync(expect(paneAt(page, PREVIEW_PANE).locator('.markup')).toBeVisible())

  await expect(paneAt(page, PREVIEW_PANE).locator('[data-part="controls"]')).toBeHidden()
})

test('the pane still showing the document keeps its own editing bar', async ({ page, request }) => {
  await selectingTheWord(page, request, 'word')
  await givenAsync(previewControl(page, 'markup').click())
  await givenAsync(expect(paneAt(page, PREVIEW_PANE).locator('.markup')).toBeVisible())

  await expect(editingBar(page)).toBeVisible()
})

test('the preview controls sit at the far end of the bar, away from the formatting ones', async ({ page, request }) => {
  await selectingTheWord(page, request, 'word')
  const quote = await editingBar(page).locator('[data-part="format-quote"]').boundingBox()

  const preview = await previewControl(page, 'markup').boundingBox()

  expect(preview?.x).toBeGreaterThan((quote?.x ?? 0) + GAP_PX)
})
