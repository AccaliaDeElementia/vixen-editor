'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

test('the row the reader is on keeps focus when another client changes the store', async ({ page, request }) => {
  const stamp = String(Date.now())
  const mine = `chaosfocus-${stamp}.md`
  const noise = `anoise-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: mine, content: '# mine' } })

  await page.goto('/doc/')
  const row = page.locator(`.tree__row[data-path="${mine}"]`)
  await givenAsync(expect(row).toBeVisible())
  await row.focus()
  await givenAsync(expect(row).toBeFocused())

  await request.post('/api/files/documents', { data: { path: noise, content: '# elsewhere' } })
  await givenAsync(expect(page.locator(`.tree__row[data-path="${noise}"]`)).toBeVisible())

  await expect(row).toBeFocused()

  await request.delete(`/api/files/entries/${mine}`)
  await request.delete(`/api/files/entries/${noise}`)
})
