'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test, type Page } from '@playwright/test'

import { workspace } from './fixtures.ts'

async function selectWithoutOpening(page: Page, folder: string, name: string): Promise<void> {
  const row = page.locator(`[role="treeitem"][data-path="${folder}/${name}"]`)
  await row.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await givenAsync(expect(row).toHaveAttribute('aria-selected', 'true'))
}

test('the insert button is off when the selection is not a file', async ({ page, request }) => {
  const folder = `ins-${String(Date.now())}`
  await page.goto(await workspace(request, folder))
  await givenAsync(expect(page.locator('[role="tree"]')).toBeVisible())

  await givenAsync(expect(page.locator('#insert-entry')).toBeEnabled())

  await page.locator('[role="treeitem"][data-path=".trash"]').click()

  await givenAsync(expect(page.locator('#insert-entry')).toBeDisabled())

  await selectWithoutOpening(page, folder, 'other.md')

  await expect(page.locator('#insert-entry')).toBeEnabled()

  await request.delete(`/api/files/entries/${folder}`)
})

test('the button inserts a relative link at the caret and says so', async ({ page, request }) => {
  const folder = `insb-${String(Date.now())}`
  await page.goto(await workspace(request, folder))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await selectWithoutOpening(page, folder, 'other.md')

  await page.locator('#insert-entry').click()

  await givenAsync(expect(page.locator('.cm-content')).toContainText('[other.md](other.md)'))
  await expect(page.locator('#status .toast').last()).toContainText('Inserted a link to')

  await request.delete(`/api/files/entries/${folder}`)
})

test('Mod-i on the tree inserts the selected file', async ({ page, request }) => {
  const folder = `insk-${String(Date.now())}`
  await page.goto(await workspace(request, folder))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await selectWithoutOpening(page, folder, 'other.md')

  await page.locator(`[role="treeitem"][data-path="${folder}/other.md"]`).focus()
  await page.keyboard.press('ControlOrMeta+i')

  await expect(page.locator('.cm-content')).toContainText('[other.md](other.md)')

  await request.delete(`/api/files/entries/${folder}`)
})

test('Mod-i with no file selected says why it did nothing', async ({ page, request }) => {
  const folder = `insn-${String(Date.now())}`
  await page.goto(await workspace(request, folder))
  await givenAsync(expect(page.locator('[role="tree"]')).toBeVisible())

  const trash = page.locator('[role="treeitem"][data-path=".trash"]')
  await trash.click()
  await trash.focus()
  await page.keyboard.press('ControlOrMeta+i')

  await expect(page.locator('#status .toast').last()).toContainText('Select a file in the browser first')

  await request.delete(`/api/files/entries/${folder}`)
})

test('a folder inserts a link, exactly as dragging one does', async ({ page, request }) => {
  const folder = `insf-${String(Date.now())}`
  await page.goto(await workspace(request, folder))
  await request.post('/api/files/folders', { data: { path: `${folder}/sub` } })
  await page.reload()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await selectWithoutOpening(page, folder, 'sub')

  await page.locator('#insert-entry').click()

  await expect(page.locator('.cm-content')).toContainText('[sub](sub/)')

  await request.delete(`/api/files/entries/${folder}`)
})
