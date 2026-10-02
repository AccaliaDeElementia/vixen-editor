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
