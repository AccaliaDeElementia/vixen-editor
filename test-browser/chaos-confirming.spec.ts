'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

test('an armed confirmation survives another client changing something else', async ({ page, request }) => {
  const stamp = String(Date.now())
  const deleted = `chaosarm-${stamp}.md`
  const noise = `anoise-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: deleted, content: '# gone' } })
  await request.delete(`/api/files/entries/${deleted}`)

  await page.goto('/doc/')
  const control = page.locator('.tree__empty-trash')
  await givenAsync(expect(control).toBeVisible())
  await control.click()
  await givenAsync(expect(control).toHaveText(/for good/v))

  await request.post('/api/files/documents', { data: { path: noise, content: '# elsewhere' } })
  await givenAsync(expect(page.locator(`.tree__row[data-path="${noise}"]`)).toBeVisible())

  await expect(control).toHaveText(/for good/v)

  await request.delete(`/api/files/entries/${noise}`)
})
