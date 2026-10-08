'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

test('the file browser shows what another client created, without a reload', async ({ page, request }) => {
  const name = `remote-${String(Date.now())}.md`
  await page.goto('/doc/')
  await givenAsync(expect(page.locator('#file-tree')).toBeVisible())

  await request.post('/api/files/documents', { data: { path: name, content: '# from elsewhere' } })

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('the file browser lets go of what another client deleted', async ({ page, request }) => {
  const name = `remotegone-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# going' } })
  await page.goto('/doc/')
  await givenAsync(expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible())

  await request.delete(`/api/files/entries/${name}`)

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toHaveCount(0)
})
