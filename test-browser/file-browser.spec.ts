'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

test('the file browser lists what the store holds', async ({ page, request }) => {
  const folder = `tree-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: folder } })

  await page.goto('/doc/')

  const row = page.locator(`.tree__row[data-path="${folder}"]`)
  await givenAsync(expect(row).toHaveAttribute('aria-expanded', 'false'))
  await givenAsync(expect(page.locator('.tree__row[data-kind="trash-root"]')).toBeVisible())

  await expect(row).toBeVisible()

  await request.delete(`/api/files/entries/${folder}`)
})

test('a folder opens on click and its contents appear below it, indented by label and not by row', async ({
  page,
  request,
}) => {
  const folder = `open-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: folder } })

  await page.goto('/doc/')
  await page.locator(`.tree__row[data-path="${folder}"]`).click()

  const child = page.locator(`.tree__row[data-path="${folder}/index.md"]`)
  await givenAsync(expect(child).toBeVisible())

  const parentLabel = await page.locator(`.tree__row[data-path="${folder}"] .tree__name`).boundingBox()
  const childLabel = await child.locator('.tree__name').boundingBox()
  expect(childLabel?.x ?? 0).toBeGreaterThan(parentLabel?.x ?? 0)

  await request.delete(`/api/files/entries/${folder}`)
})

test('a document row stays a real link, so the browser can open it its own way', async ({ page, request }) => {
  const name = `link-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name } })

  await page.goto('/doc/')

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toHaveAttribute('href', `/doc/${name}`)

  await request.delete(`/api/files/entries/${name}`)
})

test('a modified click opens a tab rather than being swallowed', async ({ page, request }) => {
  const name = `newtab-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# in a new tab' } })
  await page.goto('/doc/')

  const opened = page.context().waitForEvent('page')
  await page.locator(`.tree__row[data-path="${name}"]`).click({ modifiers: ['ControlOrMeta'] })
  const tab = await opened

  await givenAsync(expect(tab).toHaveURL(`/doc/${name}`))
  expect(new URL(page.url()).pathname).toBe('/doc/')

  await tab.close()
  await request.delete(`/api/files/entries/${name}`)
})
