'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

test('the selected document is visibly marked, not merely marked up', async ({ page, request }) => {
  const name = `sel-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name } })

  await page.goto(`/doc/${name}`)
  const row = page.locator(`.tree__row[data-path="${name}"]`)
  await givenAsync(expect(row).toHaveAttribute('aria-selected', 'true'))

  const panel = await page.locator('#explorer').evaluate((el) => getComputedStyle(el).backgroundColor)
  const selected = await row.evaluate((el) => getComputedStyle(el).backgroundColor)
  const accent = await row.evaluate((el) => getComputedStyle(el).boxShadow)

  expect({ background: selected === panel, accent: accent === 'none' }).toStrictEqual({
    background: false,
    accent: false,
  })

  await request.delete(`/api/files/entries/${name}`)
})

test('an unselected sibling is painted differently from the selected row', async ({ page, request }) => {
  const stamp = String(Date.now())
  await request.post('/api/files/documents', { data: { path: `pick-${stamp}.md` } })
  await request.post('/api/files/documents', { data: { path: `other-${stamp}.md` } })

  await page.goto(`/doc/pick-${stamp}.md`)

  const chosen = await page
    .locator(`.tree__row[data-path="pick-${stamp}.md"]`)
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  const sibling = await page
    .locator(`.tree__row[data-path="other-${stamp}.md"]`)
    .evaluate((el) => getComputedStyle(el).backgroundColor)

  expect(chosen).not.toBe(sibling)

  await request.delete(`/api/files/entries/pick-${stamp}.md`)
  await request.delete(`/api/files/entries/other-${stamp}.md`)
})

test('a single click opens a document and selects it', async ({ page, request }) => {
  const name = `select-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# seed' } })
  await page.goto('/doc/')

  const row = page.locator(`[role="treeitem"][data-path="${name}"]`)
  await row.click()

  await givenAsync(expect(row).toHaveAttribute('aria-selected', 'true'))
  expect(new URL(page.url()).pathname).toBe(`/doc/${name}`)

  await request.delete(`/api/files/entries/${name}`)
})

test('moving through the tree selects without opening, so a file can be aimed at', async ({ page, request }) => {
  const name = `aim-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# seed' } })
  await page.goto('/doc/')

  const row = page.locator(`[role="treeitem"][data-path="${name}"]`)
  await row.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')

  await givenAsync(expect(row).toHaveAttribute('aria-selected', 'true'))
  expect(new URL(page.url()).pathname).toBe('/doc/')

  await request.delete(`/api/files/entries/${name}`)
})

test('a double click opens it', async ({ page, request }) => {
  const name = `open-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# opened by double click' } })
  await page.goto('/doc/')

  await page.locator(`[role="treeitem"][data-path="${name}"]`).dblclick()

  await givenAsync(expect(page.locator('.cm-content')).toContainText('# opened by double click'))
  expect(new URL(page.url()).pathname).toBe(`/doc/${name}`)

  await request.delete(`/api/files/entries/${name}`)
})

test('the toolbar opens whatever is selected', async ({ page, request }) => {
  const name = `toolbar-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# opened from the toolbar' } })
  await page.goto('/doc/')

  await page.locator(`[role="treeitem"][data-path="${name}"]`).click()
  await page.locator('#open-selected').click()

  await expect(page.locator('.cm-content')).toContainText('# opened from the toolbar')

  await request.delete(`/api/files/entries/${name}`)
})
