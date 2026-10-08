'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import { stringFieldOf } from './json.ts'

test('a choice in the restore tree survives another client changing the store', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `chaosrestore-${stamp}`
  const noise = `anoise-${stamp}.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: `${folder}/left.md`, content: '# left' } })
  const trashId = await stringFieldOf(await request.delete(`/api/files/entries/${folder}`), 'trashId')

  await page.goto(`/trash/${trashId}`)
  await givenAsync(expect(page.locator('[data-part="deleted-contents"] [role="tree"]')).toBeVisible())
  const chosen = page.locator('.restore-tree__row[data-path="left.md"]')
  await chosen.click()
  await givenAsync(expect(chosen).toHaveAttribute('aria-checked', 'false'))

  await request.post('/api/files/documents', { data: { path: noise, content: '# elsewhere' } })
  await givenAsync(page.locator('#toggle-explorer').click())
  await givenAsync(expect(page.locator(`.tree__row[data-path="${noise}"]`)).toBeVisible())

  await expect(chosen).toHaveAttribute('aria-checked', 'false')

  await request.delete(`/api/trash/${trashId}`)
  await request.delete(`/api/files/entries/${noise}`)
})
