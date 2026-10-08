'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { previewControl } from './fixtures.ts'

test('the tab in front stays in front when another client changes the store', async ({ page, request }) => {
  const stamp = String(Date.now())
  const mine = `chaostab-${stamp}.md`
  const noise = `anoise-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: mine, content: '# mine' } })

  await page.goto(`/doc/${mine}`)
  await previewControl(page, 'markup').click()
  const preview = page.locator(`[data-tab="markup:${mine}"]`)
  await givenAsync(expect(preview).toBeVisible())

  await request.post('/api/files/documents', { data: { path: noise, content: '# elsewhere' } })
  await givenAsync(expect(page.locator(`.tree__row[data-path="${noise}"]`)).toBeVisible())

  await expect(preview).toHaveAttribute('aria-selected', 'true')

  await request.delete(`/api/files/entries/${mine}`)
  await request.delete(`/api/files/entries/${noise}`)
})
