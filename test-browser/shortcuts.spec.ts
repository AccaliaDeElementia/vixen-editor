'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Locator, Page } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

async function openedHelp(page: Page, request: Page['request'], name: string): Promise<void> {
  await page.goto(await storedDocument(request, name))
  await page.locator('#show-shortcuts').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
}

function against(page: Page, does: string): Locator {
  return page.locator('#file-dialog-body dt', { hasText: does }).locator('xpath=following-sibling::dd[1]')
}

test('the help dialog names the modifier the reader presses, rather than both', async ({ page, request }) => {
  await openedHelp(page, request, `keys-${String(Date.now())}.md`)

  const held = await page.evaluate(() => (navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'))

  await expect(against(page, 'Save the document')).toHaveText(`${held} + S`)
})

test('the help dialog keeps the longer list behind a toggle, rather than opening on it', async ({ page, request }) => {
  await openedHelp(page, request, `curated-${String(Date.now())}.md`)

  await expect(page.locator('#file-dialog-body')).not.toContainText('More keys the editor binds')
})

test('the toggle brings up the keys the cheatsheet leaves out', async ({ page, request }) => {
  await openedHelp(page, request, `everything-${String(Date.now())}.md`)

  await page.locator('#file-dialog-mode').click()

  await expect(against(page, 'Go to a line by number')).toBeVisible()
})

test('the help dialog names the redo this platform binds, which is not the same everywhere', async ({
  page,
  request,
}) => {
  await openedHelp(page, request, `redo-${String(Date.now())}.md`)

  const expected = await page.evaluate(() => {
    if (navigator.platform.includes('Mac')) return 'Cmd + Shift + Z'

    return /Linux|X11/v.test(navigator.platform) ? 'Ctrl + Y or Ctrl + Shift + Z' : 'Ctrl + Y'
  })

  await expect(against(page, 'Redo what you undid')).toHaveText(expected)
})

test('the editing bar names the redo this platform binds, rather than every platform at once', async ({
  page,
  request,
}) => {
  await page.goto(await storedDocument(request, `bar-redo-${String(Date.now())}.md`))

  const expected = await page.evaluate(() => {
    if (navigator.platform.includes('Mac')) return 'Meta+Shift+Z'

    return /Linux|X11/v.test(navigator.platform) ? 'Control+Y Control+Shift+Z' : 'Control+Y'
  })

  await expect(page.locator('[data-part="edit-redo"]').first()).toHaveAttribute('aria-keyshortcuts', expected)
})
