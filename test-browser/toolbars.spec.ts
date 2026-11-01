'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { storedDocument } from './fixtures.ts'

const FILE_ACTIONS = '[data-part="file-actions"]'
const EDITING_BAR = '[data-part="controls"]'
const NOTHING_FOCUSED = 0

test('the file actions take one tab stop, so the tree is a key away rather than eight', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `bar-${String(Date.now())}.md`))
  await givenAsync(expect(page.locator('#file-tree')).toBeVisible())
  await page.locator('#new-document').focus()

  await page.keyboard.press('Tab')

  await expect(page.locator(`${FILE_ACTIONS} :focus`)).toHaveCount(NOTHING_FOCUSED)
})

test('an arrow walks the file actions, which is how the rest of them are reached', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `barb-${String(Date.now())}.md`))
  await givenAsync(expect(page.locator('#file-tree')).toBeVisible())
  await page.locator('#new-document').focus()

  await page.keyboard.press('ArrowRight')

  await expect(page.locator('#new-folder')).toBeFocused()
})

test('End reaches the last of the file actions without pressing every arrow between', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `barc-${String(Date.now())}.md`))
  await givenAsync(expect(page.locator('#insert-entry')).toBeEnabled())
  await page.locator('#new-document').focus()

  await page.keyboard.press('End')

  await expect(page.locator('#insert-entry')).toBeFocused()
})

test('the editing bar takes one tab stop too, rather than fifteen', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `bard-${String(Date.now())}.md`, '# one\n'))
  await givenAsync(expect(page.locator(`${EDITING_BAR} [data-part="edit-undo"]`)).toBeVisible())
  await page.locator('[data-part="edit-undo"]').focus()

  await page.keyboard.press('Tab')

  await expect(page.locator(`${EDITING_BAR} :focus`)).toHaveCount(NOTHING_FOCUSED)
})

test('an arrow walks the editing bar across the divider between its groups', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `bare-${String(Date.now())}.md`, '# one\n'))
  await givenAsync(expect(page.locator(`${EDITING_BAR} [data-part="edit-find"]`)).toBeVisible())
  await page.locator('[data-part="edit-find"]').focus()

  await page.keyboard.press('ArrowRight')

  await expect(page.locator('[data-part="format-bold"]')).toBeFocused()
})
