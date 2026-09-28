'use sanity'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function workspace(request: APIRequestContext, folder: string): Promise<string> {
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: `${folder}/notes.md`, content: '# notes\n' } })
  await request.post('/api/files/documents', { data: { path: `${folder}/other.md`, content: '# other\n' } })

  return `/doc/${folder}/notes.md`
}

async function select(page: Page, folder: string, name: string): Promise<void> {
  await page.locator(`[role="treeitem"][data-path="${folder}/${name}"]`).click()
}

test('the insert button is off when the selection is not a file', async ({ page, request }) => {
  const folder = `ins-${String(Date.now())}`
  await page.goto(await workspace(request, folder))
  await expect(page.locator('[role="tree"]')).toBeVisible()

  await expect(page.locator('#insert-entry')).toBeEnabled()

  await page.locator('[role="treeitem"][data-path=".trash"]').click()

  await expect(page.locator('#insert-entry')).toBeDisabled()

  await select(page, folder, 'other.md')

  await expect(page.locator('#insert-entry')).toBeEnabled()

  await request.delete(`/api/files/entries/${folder}`)
})

test('the button inserts a relative link at the caret and says so', async ({ page, request }) => {
  const folder = `insb-${String(Date.now())}`
  await page.goto(await workspace(request, folder))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await select(page, folder, 'other.md')

  await page.locator('#insert-entry').click()

  await expect(page.locator('.cm-content')).toContainText('[other.md](other.md)')
  await expect(page.locator('#status .toast').last()).toContainText('Inserted a link to')

  await request.delete(`/api/files/entries/${folder}`)
})

test('Mod-i on the tree inserts the selected file', async ({ page, request }) => {
  const folder = `insk-${String(Date.now())}`
  await page.goto(await workspace(request, folder))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await select(page, folder, 'other.md')

  await page.locator(`[role="treeitem"][data-path="${folder}/other.md"]`).focus()
  await page.keyboard.press('ControlOrMeta+i')

  await expect(page.locator('.cm-content')).toContainText('[other.md](other.md)')

  await request.delete(`/api/files/entries/${folder}`)
})

test('Mod-i with no file selected says why it did nothing', async ({ page, request }) => {
  const folder = `insn-${String(Date.now())}`
  await page.goto(await workspace(request, folder))
  await expect(page.locator('[role="tree"]')).toBeVisible()

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
  await select(page, folder, 'sub')

  await page.locator('#insert-entry').click()

  await expect(page.locator('.cm-content')).toContainText('[sub](sub/)')

  await request.delete(`/api/files/entries/${folder}`)
})
