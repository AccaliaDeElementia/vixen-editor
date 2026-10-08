'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

test('an open dialog keeps what the reader typed when another client changes the store', async ({ page, request }) => {
  const stamp = String(Date.now())
  const noise = `anoise-${stamp}.md`
  const typed = `half-written-${stamp}`

  await page.goto('/doc/')
  await givenAsync(expect(page.locator('#file-tree')).toBeVisible())
  await page.locator('#new-document').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-entry').fill(typed)

  await request.post('/api/files/documents', { data: { path: noise, content: '# elsewhere' } })
  await givenAsync(expect(page.locator(`.tree__row[data-path="${noise}"]`)).toBeVisible())

  await expect(page.locator('#file-dialog-entry')).toHaveValue(typed)

  await request.delete(`/api/files/entries/${noise}`)
})
