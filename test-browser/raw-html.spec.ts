'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Locator, Page } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

import { previewControl } from './fixtures.ts'

const MARKUP_BODY = '[data-part="markup-body"]'
const RAN_SOMETHING = 'vixenRanSomething'

declare global {
  interface Window {
    vixenRanSomething?: unknown
  }
}

async function previewOf(page: Page, request: APIRequestContext, markdown: string): Promise<Locator> {
  const name = `html-${String(Date.now())}-${String(Math.random()).slice(2)}.md`
  await request.post('/api/files/documents', { data: { path: name, content: markdown } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  await previewControl(page, 'markup').click()
  const body = page.locator(MARKUP_BODY).last()
  await givenAsync(expect(body).toBeVisible())

  return body
}

test('a document may write the markup that markdown has no syntax for', async ({ page, request }) => {
  const body = await previewOf(page, request, 'a <b>bold</b> and <i>slanted</i> word\n')

  await expect(body.locator('b')).toHaveText('bold')
})

test('an anchor keeps the name a reader links to it by', async ({ page, request }) => {
  const body = await previewOf(page, request, '<a name="here">landing</a>\n')

  await expect(body.locator('a')).toHaveAttribute('name', 'here')
})

test('a details block stays foldable, because that is markup markdown cannot write', async ({ page, request }) => {
  const body = await previewOf(page, request, '<details><summary>more</summary>hidden</details>\n')

  await expect(body.locator('details summary')).toHaveText('more')
})

test('a script a document carries never runs', async ({ page, request }) => {
  await previewOf(page, request, `<script>window.${RAN_SOMETHING} = 'script'</script>\n`)

  expect(await page.evaluate(() => window.vixenRanSomething)).toBeUndefined()
})

test('a script a document carries leaves no element behind either', async ({ page, request }) => {
  const body = await previewOf(page, request, '<script>let x = 1</script>\n')

  await expect(body.locator('script')).toHaveCount(0)
})

test('an event handler is taken off the element it was written on', async ({ page, request }) => {
  const body = await previewOf(page, request, `<div onclick="window.${RAN_SOMETHING} = 'click'">press</div>\n`)
  await givenAsync(expect(body.locator('div', { hasText: 'press' }).last()).toBeVisible())

  await expect(body.locator('div', { hasText: 'press' }).last()).not.toHaveAttribute('onclick', /./v)
})

test('a frame a document asks for is never embedded', async ({ page, request }) => {
  const body = await previewOf(page, request, '<iframe src="https://example.com"></iframe>\n')

  await expect(body.locator('iframe')).toHaveCount(0)
})

test('a stylesheet a document carries is never applied', async ({ page, request }) => {
  const body = await previewOf(page, request, '<style>.markup { display: none }</style>\n\ntext\n')

  await expect(body.locator('style')).toHaveCount(0)
})

test('a linked stylesheet is refused the same way an inline one is', async ({ page, request }) => {
  const body = await previewOf(page, request, '<link rel="stylesheet" href="https://example.com/x.css">\n')

  await expect(body.locator('link')).toHaveCount(0)
})

test('a style attribute does not reach the element it was written on', async ({ page, request }) => {
  const body = await previewOf(page, request, '<p style="display:none">visible</p>\n')

  await expect(body.locator('p', { hasText: 'visible' }).last()).not.toHaveAttribute('style', /./v)
})

test('a link that would run code instead of going somewhere loses its destination', async ({ page, request }) => {
  const body = await previewOf(page, request, `<a href="javascript:window.${RAN_SOMETHING}=1">go</a>\n`)

  await expect(body.locator('a')).not.toHaveAttribute('href', /./v)
})

test('an image that would run code on failure loses its source', async ({ page, request }) => {
  const body = await previewOf(page, request, `<img src="x" onerror="window.${RAN_SOMETHING}=1" alt="broken">\n`)

  await expect(body.locator('img')).not.toHaveAttribute('onerror', /./v)
})

test('a block that sanitises away to nothing leaves no empty container behind', async ({ page, request }) => {
  const body = await previewOf(page, request, '<script>let x = 1</script>\n')

  await expect(body.locator('.markup__html')).toHaveCount(0)
})
