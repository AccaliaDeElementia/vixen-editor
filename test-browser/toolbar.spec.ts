'use sanity'

import { given, givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

import { stringFieldOf } from './json.ts'

test('the toolbar creates a folder through a real modal dialog', async ({ page, request }) => {
  const name = `made-${String(Date.now())}`
  await page.goto('/doc/')

  await page.locator('#new-folder').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-entry').fill(name)
  await page.locator('#file-dialog-confirm').click()

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('Enter in the name field confirms, though Cancel is the first button the form would submit', async ({
  page,
  request,
}) => {
  const name = `entered-${String(Date.now())}`
  await page.goto('/doc/')

  await page.locator('#new-folder').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-entry').fill(name)
  await page.locator('#file-dialog-entry').press('Enter')

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('a new document opens in the editor, so the user lands in what they just made', async ({ page, request }) => {
  const name = `opened-${String(Date.now())}`
  await page.goto('/doc/')

  await page.locator('#new-document').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-entry').fill(`${name}.md`)
  await page.locator('#file-dialog-confirm').click()

  await givenAsync(expect(page).toHaveURL(`/doc/${name}.md`))
  await expect(page.locator('.cm-content')).toContainText(`# ${name}`)

  await request.delete(`/api/files/entries/${name}.md`)
})

test('a new folder leaves the editor on the document that was already open', async ({ page, request }) => {
  const held = `held-${String(Date.now())}.md`
  const folder = `grown-${String(Date.now())}`
  await request.post('/api/files/documents', { data: { path: held, content: '# held open' } })
  await page.goto(`/doc/${held}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('# held open'))

  await page.locator('#new-folder').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-entry').fill(folder)
  await page.locator('#file-dialog-confirm').click()

  await givenAsync(expect(page.locator(`.tree__row[data-path="${folder}"]`)).toHaveAttribute('aria-expanded', 'true'))
  await expect(page).toHaveURL(`/doc/${held}`)

  await request.delete(`/api/files/entries/${folder}`)
  await request.delete(`/api/files/entries/${held}`)
})

test('the dialog shows the name it will create, so .md is not typed twice', async ({ page }) => {
  const name = `forced-${String(Date.now())}`
  await page.goto('/doc/')

  await page.locator('#new-document').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-entry').fill(name)

  await expect(page.locator('#file-dialog-preview')).toHaveText(`Creates ${name}.md`)

  await page.locator('#file-dialog-cancel').click()
})

test('a document named without an extension is created as markdown', async ({ page, request }) => {
  const name = `bare-${String(Date.now())}`
  await page.goto('/doc/')

  await page.locator('#new-document').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-entry').fill(name)
  await page.locator('#file-dialog-confirm').click()

  await givenAsync(expect(page).toHaveURL(`/doc/${name}.md`))
  await expect(page.locator('.cm-content')).toContainText(`# ${name}`)

  await request.delete(`/api/files/entries/${name}.md`)
})

test('a rejected name stays in the dialog to be corrected', async ({ page, request }) => {
  const name = `taken-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: name } })
  await page.goto('/doc/')

  await page.locator('#new-folder').click()
  await page.locator('#file-dialog-entry').fill(name)
  await page.locator('#file-dialog-confirm').click()

  await givenAsync(expect(page.locator('#file-dialog-error')).toHaveText(/exists/iv))
  await expect(page.locator('#file-dialog')).toBeVisible()

  await page.locator('#file-dialog-cancel').click()
  await request.delete(`/api/files/entries/${name}`)
})

test('the archive link follows the selection', async ({ page, request }) => {
  const name = `zip-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: name } })

  await page.goto('/doc/')
  await givenAsync(expect(page.locator('#download-archive')).toHaveAttribute('href', '/api/files/archive'))

  await page.locator(`.tree__row[data-path="${name}"]`).click()
  await expect(page.locator('#download-archive')).toHaveAttribute('href', `/api/files/archive?path=${name}`)

  await request.delete(`/api/files/entries/${name}`)
})

test('closing the explorer takes its actions away rather than disabling them', async ({ page }) => {
  await page.goto('/doc/')
  await givenAsync(expect(page.locator('#new-folder')).toBeVisible())

  await page.locator('#toggle-explorer').click()

  await expect(page.locator('#new-folder')).toBeHidden()
})

test('the trash actions are distinguishable by sight and by tooltip', async ({ page, request }) => {
  const name = `bin-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name } })
  const trashed = await request.delete(`/api/files/entries/${name}`)
  const trashId = await stringFieldOf(trashed, 'trashId')

  await page.goto('/doc/')
  await page.locator('.tree__row[data-kind="trash-root"]').click()

  const restore = page.locator(`[data-action="restore"][data-trash-id="${trashId}"]`)
  const purge = page.locator(`[data-action="purge"][data-trash-id="${trashId}"]`)

  await givenAsync(expect(restore).toHaveAttribute('title', `Restore ${name}`))
  await givenAsync(expect(purge).toHaveAttribute('title', `Delete ${name} for good`))

  const restoreBox = await restore.locator('.icon').boundingBox()
  const purgeBox = await purge.locator('.icon').boundingBox()
  given(() => {
    expect(restoreBox?.width ?? 0).toBeGreaterThan(0)
  })
  given(() => {
    expect(purgeBox?.width ?? 0).toBeGreaterThan(0)
  })

  await expect(purge).toHaveClass(/tree__action--danger/v)

  await request.delete(`/api/trash/${trashId}`)
})
