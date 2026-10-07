'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { storedDocument } from './fixtures.ts'

const ASIDE = 1

test('a kept preview tab paints after a reload, without being clicked', async ({ page, request }) => {
  const name = `preview-${String(Date.now())}.md`
  await page.goto(await storedDocument(request, name, '# a heading\n\nand some words'))
  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator('.pane')).toHaveCount(2))
  await page.locator('.pane').nth(ASIDE).locator(`[data-tab="markup:${name}"]`).dblclick()

  await page.reload()

  await expect(page.locator('.pane').nth(ASIDE).locator('[data-part="markup-body"]')).toContainText('a heading')
})
