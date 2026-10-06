'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

test('a path that names nothing reports itself as missing', async ({ page }) => {
  await page.goto('/doc/definitely/not/here.md')

  await givenAsync(expect(page.locator('[data-part="view-missing"]')).toBeVisible())
  await givenAsync(expect(page.locator('[data-part="editor"]')).toBeHidden())

  await expect(page.locator('[data-part="missing-path"]')).toHaveText('definitely/not/here.md')
})

test('a folder with no index still opens an editable buffer', async ({ page }) => {
  await page.goto('/doc/')

  await givenAsync(expect(page.locator('[data-part="editor"]')).toBeVisible())
  await expect(page.locator('[data-part="view-missing"]')).toBeHidden()
})

test('a missing document offers to create it, and creating it opens the editor', async ({ page }) => {
  const name = `created-${String(Date.now())}.md`
  await page.goto(`/doc/${name}`)

  await givenAsync(expect(page.locator('[data-part="view-missing"]')).toBeVisible())
  await page.locator('[data-part="missing-create"]').click()

  await givenAsync(
    expect(page.locator('[data-part="tabs"] [role="tab"][aria-selected="true"]')).toHaveAttribute('data-path', name),
  )

  await expect(page.locator('[data-part="editor"]')).toBeVisible()
})
