'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

import { deletedEntry } from './fixtures.ts'

test('a trashed document is offered back at the path it came from', async ({ page, request }) => {
  const name = `trashed-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# rescued' } })
  await request.delete(`/api/files/entries/${name}`)

  await page.goto(`/doc/${name}`)

  const restore = page.locator('#missing-restore-list button')
  await givenAsync(expect(restore).toBeVisible())
  await restore.click()

  await expect(page.locator('.cm-content')).toContainText('# rescued')
})

test('a trash entry url says what was deleted', async ({ page, request }) => {
  const name = `deleted-${String(Date.now())}.md`
  const trashId = await deletedEntry(request, name)

  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('#view-deleted')).toBeVisible())

  await expect(page.locator('#deleted-what')).toContainText(`The file ${name} was deleted`)
})

test('a trash entry offers the document back', async ({ page, request }) => {
  const name = `restored-${String(Date.now())}.md`
  const trashId = await deletedEntry(request, name)
  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('#view-deleted')).toBeVisible())

  await page.locator('#deleted-restore').click()

  await expect(page.locator('.cm-content')).toContainText('# gone')
})

test('a trash entry that is no longer there says so', async ({ page }) => {
  await page.goto('/trash/0d5caef1-147f-45bf-8546-270886fcaa8f')

  await givenAsync(expect(page.locator('#view-deleted')).toBeVisible())
  await givenAsync(expect(page.locator('#deleted-actions')).toBeHidden())

  await expect(page.locator('#deleted-what')).toContainText('already have been restored or purged')
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
  await request.post(`/api/trash/${trashId}/restore`)

  expect(await (await request.get(`/api/documents/${name}`)).text()).toContain('TYPED-BUT-UNSAVED')

  await request.delete(`/api/files/entries/${name}`)
})
