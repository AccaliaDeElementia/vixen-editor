'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

test('a path that names nothing reports itself as missing', async ({ page }) => {
  await page.goto('/doc/definitely/not/here.md')

  await givenAsync(expect(page.locator('#view-missing')).toBeVisible())
  await givenAsync(expect(page.locator('#editor')).toBeHidden())

  await expect(page.locator('#missing-path')).toHaveText('definitely/not/here.md')
})

test('a folder with no index still opens an editable buffer', async ({ page }) => {
  await page.goto('/doc/')

  await givenAsync(expect(page.locator('#editor')).toBeVisible())
  await expect(page.locator('#view-missing')).toBeHidden()
})

test('a missing document offers to create it, and creating it opens the editor', async ({ page }) => {
  const name = `created-${String(Date.now())}.md`
  await page.goto(`/doc/${name}`)

  await givenAsync(expect(page.locator('#view-missing')).toBeVisible())
  await page.locator('#missing-create').click()

  await givenAsync(
    expect(page.locator('#tab-strip [role="tab"][aria-selected="true"]')).toHaveAttribute('data-path', name),
  )

  await expect(page.locator('#editor')).toBeVisible()
})
