'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { deletedEntry, openLayout } from './fixtures.ts'

test('the sidebar opens on the file browser, which is where a reader starts', async ({ page }) => {
  await openLayout(page)

  await expect(page.locator('#file-tree')).toBeVisible()
})

test('asking for the trash puts it where the file browser was, rather than beside it', async ({ page, request }) => {
  await deletedEntry(request, `panel-${String(Date.now())}.md`)
  await openLayout(page)

  await page.locator('#show-trash').click()

  await expect(page.locator('#file-tree')).toBeHidden()
})

test('the trash lists what was deleted once its panel is up', async ({ page, request }) => {
  const name = `listed-${String(Date.now())}.md`
  await deletedEntry(request, name)
  await openLayout(page)

  await page.locator('#show-trash').click()

  await expect(page.locator('#trash-list [role="treeitem"]').filter({ hasText: name })).toBeVisible()
})

test('asking for the file browser again brings it back', async ({ page, request }) => {
  await deletedEntry(request, `back-${String(Date.now())}.md`)
  await openLayout(page)
  await givenAsync(page.locator('#show-trash').click())
  await givenAsync(expect(page.locator('#file-tree')).toBeHidden())

  await page.locator('#toggle-explorer').click()

  await expect(page.locator('#file-tree')).toBeVisible()
})

test('asking for the panel already up closes the sidebar, the way a rail usually behaves', async ({ page }) => {
  await openLayout(page)

  await page.locator('#toggle-explorer').click()

  await expect(page.locator('#explorer')).toBeHidden()
})

test('the panel a reader left showing is the one that comes back after a reload', async ({ page, request }) => {
  await deletedEntry(request, `kept-${String(Date.now())}.md`)
  await openLayout(page)
  await givenAsync(page.locator('#show-trash').click())
  await givenAsync(expect(page.locator('#trash-list')).toBeVisible())

  await page.reload()

  await expect(page.locator('#trash-list')).toBeVisible()
})

test('and says nothing once something has been deleted', async ({ page, request }) => {
  await deletedEntry(request, `quiet-${String(Date.now())}.md`)
  await openLayout(page)

  await page.locator('#show-trash').click()

  await expect(page.locator('[data-part="trash-empty"]')).toBeHidden()
})
