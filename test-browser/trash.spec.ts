'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { APIRequestContext, Page } from '@playwright/test'

import { deletedEntry } from './fixtures.ts'
import { stringFieldOf } from './json.ts'
import { DECODABLE_64PX_PNG_BYTES } from './png.ts'

test('a trashed document is offered back at the path it came from', async ({ page, request }) => {
  const name = `trashed-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# rescued' } })
  await request.delete(`/api/files/entries/${name}`)

  await page.goto(`/doc/${name}`)

  const restore = page.locator('[data-part="missing-restore-list"] button')
  await givenAsync(expect(restore).toBeVisible())
  await restore.click()

  await expect(page.locator('.cm-content')).toContainText('# rescued')
})

test('a trash entry url says what was deleted', async ({ page, request }) => {
  const name = `deleted-${String(Date.now())}.md`
  const trashId = await deletedEntry(request, name)

  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('[data-part="view-deleted"]')).toBeVisible())

  await expect(page.locator('[data-part="deleted-what"]')).toContainText(`The file ${name} was deleted`)
})

test('a trash entry offers the document back', async ({ page, request }) => {
  const name = `restored-${String(Date.now())}.md`
  const trashId = await deletedEntry(request, name)
  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('[data-part="view-deleted"]')).toBeVisible())

  await page.locator('[data-part="deleted-restore"]').click()

  await expect(page.locator('.cm-content')).toContainText('# gone')
})

test('a trash entry that is no longer there says so', async ({ page }) => {
  await page.goto('/trash/0d5caef1-147f-45bf-8546-270886fcaa8f')

  await givenAsync(expect(page.locator('[data-part="view-deleted"]')).toBeVisible())
  await givenAsync(expect(page.locator('[data-part="deleted-actions"]')).toBeHidden())

  await expect(page.locator('[data-part="deleted-what"]')).toContainText('already have been restored or purged')
})

test('deleting the document being edited lands on its trash entry', async ({ page, request }) => {
  const name = `open-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# open' } })

  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('# open'))
  await page.locator(`.tree__row[data-path="${name}"]`).click()
  await page.locator('#delete-entry').click()
  await page.locator('#file-dialog-confirm').click()

  await expect(page).toHaveURL(/\/trash\/[0-9a-f\-]+$/v)
})

test('what reaches the trash is what was in the buffer, not what was on disk', async ({ page, request }) => {
  const name = `typed-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# on disk' } })

  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('# on disk'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' TYPED-BUT-UNSAVED')

  await page.locator(`.tree__row[data-path="${name}"]`).click()
  await page.locator('#delete-entry').click()
  await page.locator('#file-dialog-confirm').click()
  await givenAsync(expect(page).toHaveURL(/\/trash\/[0-9a-f\-]+$/v))

  const trashId = new URL(page.url()).pathname.split('/').at(-1) ?? ''
  await request.post(`/api/trash/${trashId}/restores`, { data: { paths: [''] } })

  expect(await (await request.get(`/api/documents/${name}`)).text()).toContain('TYPED-BUT-UNSAVED')

  await request.delete(`/api/files/entries/${name}`)
})

test('restoring from a trash entry page brings the file back into the browser', async ({ page, request }) => {
  const name = `stale-${String(Date.now())}.md`
  const trashId = await deletedEntry(request, name)

  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('[data-part="deleted-restore"]')).toBeVisible())
  await givenAsync(expect(page.locator(`.tree__row[data-path="${name}"]`)).toHaveCount(0))

  await page.locator('[data-part="deleted-restore"]').click()

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('a trash entry is deleted for good from its own page, not from the file browser', async ({ page, request }) => {
  const name = `purged-${String(Date.now())}.md`
  const trashId = await deletedEntry(request, name)

  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('[data-part="deleted-purge"]')).toBeVisible())
  await page.locator('[data-part="deleted-purge"]').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-confirm').click()

  await expect(page.locator('[data-part="deleted-what"]')).toHaveText(`${name} was deleted for good.`)
})

test('the file browser offers no buttons on a deleted entry of its own', async ({ page, request }) => {
  const name = `nobtn-${String(Date.now())}.md`
  await deletedEntry(request, name)

  await page.goto('/doc/')
  await page.locator('#show-trash').click()
  const mine = page.locator('[role="treeitem"][data-path^=".trash/"]').filter({ hasText: name })
  await givenAsync(expect(mine).toBeVisible())

  await expect(mine.locator('button')).toHaveCount(0)
})

test('deleting the open image shows it in the trash, expanded and selected', async ({ page, request }) => {
  const name = `shown-${String(Date.now())}.png`
  await request.post('/api/files/uploads', {
    multipart: { path: '', file: { name, mimeType: 'image/png', buffer: DECODABLE_64PX_PNG_BYTES } },
  })

  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible())
  await page.locator(`.tree__row[data-path="${name}"]`).click()
  await page.locator('#delete-entry').click()
  await page.locator('#file-dialog-confirm').click()
  await givenAsync(expect(page).toHaveURL(/\/trash\//v))

  await expect(page.locator(`#trash-list [role="treeitem"]`).filter({ hasText: name })).toBeVisible()
})

test('the deleted entry is the one selected in the file browser', async ({ page, request }) => {
  const name = `picked-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# picked' } })

  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible())
  await page.locator(`.tree__row[data-path="${name}"]`).click()
  await page.locator('#delete-entry').click()
  await page.locator('#file-dialog-confirm').click()
  await givenAsync(expect(page).toHaveURL(/\/trash\//v))

  const trashId = new URL(page.url()).pathname.split('/').at(-1) ?? ''
  await expect(page.locator(`.tree__row[data-path=".trash/${trashId}"]`)).toHaveAttribute('aria-selected', 'true')
})

test('a restored file is selected, so the toolbar aims at where it came back to', async ({ page, request }) => {
  const folder = `back-${String(Date.now())}`
  const name = `${folder}/doc.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: name, content: '# back' } })
  const trashId = await deletedEntry(request, name)

  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('[data-part="deleted-restore"]')).toBeVisible())
  await page.locator('[data-part="deleted-restore"]').click()

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toHaveAttribute('aria-selected', 'true')

  await request.delete(`/api/files/entries/${folder}`)
})

test('a new document after a restore lands beside it, not at the store root', async ({ page, request }) => {
  const folder = `beside-${String(Date.now())}`
  const name = `${folder}/doc.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: name, content: '# back' } })
  const trashId = await deletedEntry(request, name)

  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('[data-part="deleted-restore"]')).toBeVisible())
  await page.locator('[data-part="deleted-restore"]').click()
  await givenAsync(expect(page.locator(`.tree__row[data-path="${name}"]`)).toHaveAttribute('aria-selected', 'true'))

  await page.locator('#new-document').click()
  await page.locator('#file-dialog-entry').fill('fresh')
  await page.locator('#file-dialog-confirm').click()

  await expect(page.locator(`.tree__row[data-path="${folder}/fresh.md"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${folder}`)
})

async function cherryPicked(page: Page, request: APIRequestContext, folder: string): Promise<string> {
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: `${folder}/kept.md`, content: '# kept' } })
  await request.post('/api/files/documents', { data: { path: `${folder}/left.md`, content: '# left' } })
  const trashId = await stringFieldOf(await request.delete(`/api/files/entries/${folder}`), 'trashId')

  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('[data-part="deleted-contents"] [role="tree"]')).toBeVisible())
  await page.locator('.restore-tree__row[data-path="left.md"]').click()
  await page.locator('[data-part="deleted-restore"]').click()

  return trashId
}

test('a selection inside a trashed folder brings the rest of it back', async ({ page, request }) => {
  const folder = `cherry-${String(Date.now())}`
  const trashId = await cherryPicked(page, request, folder)

  await givenAsync(page.locator('#toggle-explorer').click())

  await expect(page.locator(`.tree__row[data-path="${folder}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${folder}`)
  await request.delete(`/api/trash/${trashId}`)
})

test('what was unticked stays in the trash, and the entry still shows it', async ({ page, request }) => {
  const folder = `leftover-${String(Date.now())}`
  const trashId = await cherryPicked(page, request, folder)
  await givenAsync(expect(page.locator('.restore-tree__row')).toHaveCount(2))

  await expect(page.locator('.restore-tree__row[data-path="left.md"]')).toBeVisible()

  await request.delete(`/api/files/entries/${folder}`)
  await request.delete(`/api/trash/${trashId}`)
})

test('a row offers to put its own item back somewhere else', async ({ page, request }) => {
  const name = `elsewhere-${String(Date.now())}.md`
  const moved = `moved-${name}`
  const trashId = await deletedEntry(request, name)

  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('[data-part="deleted-contents"] [role="tree"]')).toBeVisible())
  await page.locator('.restore-tree__row[data-path=""] .restore-tree__rename').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-entry').fill(moved)
  await page.locator('#file-dialog-confirm').click()

  await expect(page.locator('.cm-content')).toContainText('# gone')

  await request.delete(`/api/files/entries/${moved}`)
})

// This suite is fullyParallel against one store, and emptying the trash is the
// one action that would reach every other spec's fixtures. The second click is
// answered rather than carried out, so the path from the button to the request
// is still exercised. What the stub takes out is covered by
// test/client/files/files-client.test.ts for the request this sends and the
// count it reads back, and by test/server/routes/trash.test.ts for the server
// actually emptying the trash.
test('confirming asks the server to empty the trash, and says what went', async ({ page, request }) => {
  const name = `sweep-${String(Date.now())}.md`
  const trashId = await deletedEntry(request, name)
  await page.route('**/api/trash', async (route) => {
    if (route.request().method() === 'DELETE') await route.fulfill({ json: { purged: 2 } })
    else await route.fallback()
  })

  await page.goto('/doc/')
  await givenAsync(page.locator('#show-trash').click())
  await givenAsync(page.locator('#empty-trash').click())
  await givenAsync(expect(page.locator('#file-dialog[open]')).toBeVisible())

  await page.locator('#file-dialog-confirm').click()

  await expect(page.locator('#status')).toContainText('Deleted 2 entries for good')

  await request.delete(`/api/trash/${trashId}`)
})

test('the question it asks is readable, rather than crammed into the control', async ({ page, request }) => {
  const name = `asked-${String(Date.now())}.md`
  const trashId = await deletedEntry(request, name)

  await page.goto('/doc/')
  await givenAsync(page.locator('#show-trash').click())

  await page.locator('#empty-trash').click()

  await expect(page.locator('#file-dialog-message')).toContainText('cannot be restored afterwards')

  await request.delete(`/api/trash/${trashId}`)
})

test('declining leaves the trash as it was', async ({ page, request }) => {
  const stamp = String(Date.now())
  const name = `kept-${stamp}.md`
  const later = `later-${stamp}.md`
  const trashId = await deletedEntry(request, name)

  await page.goto('/doc/')
  await givenAsync(page.locator('#show-trash').click())
  await givenAsync(page.locator('#empty-trash').click())
  await givenAsync(expect(page.locator('#file-dialog[open]')).toBeVisible())

  await page.locator('#file-dialog-cancel').click()

  const second = await deletedEntry(request, later)
  await givenAsync(expect(page.locator('#trash-list [role="treeitem"]').filter({ hasText: later })).toBeVisible())
  await expect(page.locator('#trash-list [role="treeitem"]').filter({ hasText: name })).toBeVisible()

  await request.delete(`/api/trash/${trashId}`)
  await request.delete(`/api/trash/${second}`)
})

test('emptying the trash closes the tab that was showing a deleted entry', async ({ page, request }) => {
  const name = `tabbed-${String(Date.now())}.md`
  const trashId = await deletedEntry(request, name)

  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('[data-part="view-deleted"]')).toBeVisible())
  await givenAsync(expect(page.locator(`[data-tab="deleted:${name}"]`)).toBeVisible())
  await givenAsync(page.locator('#empty-trash').click())
  await givenAsync(expect(page.locator('#file-dialog[open]')).toBeVisible())

  await page.locator('#file-dialog-confirm').click()

  await expect(page.locator(`[data-tab="deleted:${name}"]`)).toHaveCount(0)
})
