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

test('a Ctrl or Cmd click opens the document in the other pane', async ({ page, request }) => {
  const name = `aside-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# beside' } })
  await page.goto('/doc/')

  await page.locator(`.tree__row[data-path="${name}"]`).click({ modifiers: ['ControlOrMeta'] })

  await expect(page.locator('.pane').nth(1).locator(`[data-tab="editor:${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('a Ctrl or Cmd click leaves the first pane where it was', async ({ page, request }) => {
  const name = `asidekeep-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# beside' } })
  await page.goto('/doc/')

  await page.locator(`.tree__row[data-path="${name}"]`).click({ modifiers: ['ControlOrMeta'] })
  await givenAsync(expect(page.locator('.pane').nth(1).locator(`[data-tab="editor:${name}"]`)).toBeVisible())

  expect(new URL(page.url()).pathname).toBe('/doc/')

  await request.delete(`/api/files/entries/${name}`)
})

test.describe('a browser set to Swedish', () => {
  test.use({ locale: 'sv-SE' })

  test('gets the listing ordered the way a Swedish reader expects', async ({ page, request }, testInfo) => {
    const stamp = `${String(Date.now())}-${testInfo.project.name}`
    const zebra = `zebra-${stamp}.md`
    const apple = `\u00e4pple-${stamp}.md`
    await request.post('/api/files/documents', { data: { path: zebra, content: 'z' } })
    await request.post('/api/files/documents', { data: { path: apple, content: 'a' } })

    await page.goto('/doc/')
    await givenAsync(expect(page.locator(`.tree__row[data-path="${zebra}"]`)).toBeVisible())
    await givenAsync(expect(page.locator(`.tree__row[data-path="${apple}"]`)).toBeVisible())

    const listed = await page
      .locator('.tree__row')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-path')))

    expect(listed.indexOf(zebra)).toBeLessThan(listed.indexOf(apple))

    await request.delete(`/api/files/entries/${encodeURIComponent(zebra)}`)
    await request.delete(`/api/files/entries/${encodeURIComponent(apple)}`)
  })
})
