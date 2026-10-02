'use sanity'

import { given, givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

test('a double click navigates without a full page load', async ({ page, request }) => {
  const first = `spa-a-${String(Date.now())}.md`
  const second = `spa-b-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })

  await page.goto(`/doc/${first}`)
  await page.evaluate(() => {
    window.name = 'kept-across-soft-navigation'
  })

  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()

  await givenAsync(expect(page.locator('.cm-content')).toContainText('# second'))
  given(() => {
    expect(new URL(page.url()).pathname).toBe(`/doc/${second}`)
  })
  expect(await page.evaluate(() => window.name)).toBe('kept-across-soft-navigation')

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('back returns to the document that was open before', async ({ page, request }) => {
  const first = `back-a-${String(Date.now())}.md`
  const second = `back-b-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })

  await page.goto(`/doc/${first}`)
  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()
  await givenAsync(expect(page.locator('.cm-content')).toContainText('# second'))

  await givenAsync(expect(page.locator('#nav-back')).toBeEnabled())
  await page.locator('#nav-back').click()

  await givenAsync(expect(page.locator('.cm-content')).toContainText('# first'))
  expect(new URL(page.url()).pathname).toBe(`/doc/${first}`)

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('going forward returns to the document that back had left', async ({ page, request }) => {
  const first = `fwd-a-${String(Date.now())}.md`
  const second = `fwd-b-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })

  await page.goto(`/doc/${first}`)
  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()
  await givenAsync(expect(page.locator('.cm-content')).toContainText('# second'))
  await givenAsync(expect(page.locator('#nav-forward')).toBeDisabled())

  await page.locator('#nav-back').click()
  await givenAsync(expect(page.locator('.cm-content')).toContainText('# first'))

  await givenAsync(expect(page.locator('#nav-forward')).toBeEnabled())
  await page.locator('#nav-forward').click()

  await expect(page.locator('.cm-content')).toContainText('# second')

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('the archive link is left to the browser rather than intercepted', async ({ page, request }) => {
  const folder = `zip-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: folder } })
  await page.goto(`/doc/${folder}/`)
  await page.locator(`[role="treeitem"][data-path="${folder}"]`).click()
  await givenAsync(
    expect(page.locator('#download-archive')).toHaveAttribute('href', `/api/files/archive?path=${folder}`),
  )

  const download = page.waitForEvent('download')
  await page.locator('#download-archive').click()

  expect((await download).suggestedFilename()).toContain('.zip')

  await request.delete(`/api/files/entries/${folder}`)
})
