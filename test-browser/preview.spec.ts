'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

const PANE = '.pane'

test('the source preview opens beside the editor and shows the markup', async ({ page, request }) => {
  const name = `source-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# A heading\n\nA **bold** word' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await page.locator('#preview-source').click()

  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await expect(page.locator('[data-part="source-body"]').last()).toContainText('A **bold** word')

  await request.delete(`/api/files/entries/${name}`)
})

test('the source preview highlights the markup rather than rendering it', async ({ page, request }) => {
  const name = `highlit-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# A heading' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await page.locator('#preview-source').click()

  await expect(page.locator('[data-part="source-body"]').last().locator('span').first()).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('Alt+Shift+P reaches the source preview', async ({ page, request }) => {
  const name = `keyed-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# keyed' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('keyed'))

  await page.keyboard.press('Alt+Shift+P')

  await expect(page.locator(PANE)).toHaveCount(2)

  await request.delete(`/api/files/entries/${name}`)
})

test('the rendered preview shows a heading as a heading', async ({ page, request }) => {
  const name = `rendered-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# A heading' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await page.locator('#preview-markup').click()

  await expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('A heading')

  await request.delete(`/api/files/entries/${name}`)
})

test('Alt+P reaches the rendered preview', async ({ page, request }) => {
  const name = `altp-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# altp' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('altp'))

  await page.keyboard.press('Alt+p')

  await expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('altp')

  await request.delete(`/api/files/entries/${name}`)
})

test('asking for the source after the rendered view shows one, not both', async ({ page, request }) => {
  const name = `swap-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# swap' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('swap'))
  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('swap'))

  await page.locator('#preview-source').click()

  await expect(page.locator('[data-part="view-markup"]').last()).toBeHidden()

  await request.delete(`/api/files/entries/${name}`)
})

test('a document carrying hostile HTML runs none of it in the rendered preview', async ({ page, request }) => {
  const name = `hostile-${String(Date.now())}.md`
  const hostile = '<script>window.pwned = 1</script>\n\n<img src=x onerror="window.pwned = 1">\n'
  await request.post('/api/files/documents', { data: { path: name, content: hostile } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('window.pwned'))

  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"]').last()).toContainText('window.pwned'))

  expect(await page.evaluate(() => 'pwned' in window)).toBe(false)

  await request.delete(`/api/files/entries/${name}`)
})

test('a document carrying hostile HTML creates no element from it', async ({ page, request }) => {
  const name = `inert-${String(Date.now())}.md`
  await request.post('/api/files/documents', {
    data: { path: name, content: '<img src=x onerror="window.pwned = 1">' },
  })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('onerror'))

  await page.locator('#preview-markup').click()

  await expect(page.locator('[data-part="markup-body"] img')).toHaveCount(0)

  await request.delete(`/api/files/entries/${name}`)
})
