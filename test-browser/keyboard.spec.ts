'use sanity'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { DECODABLE_64PX_PNG_BYTES } from './png.ts'

async function workspace(request: APIRequestContext, folder: string, body: string): Promise<void> {
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: `${folder}/target.md`, content: '# the target' } })
  await request.post('/api/files/uploads', {
    multipart: { path: folder, file: { name: 'pic.png', mimeType: 'image/png', buffer: DECODABLE_64PX_PNG_BYTES } },
  })
  await request.post('/api/files/documents', { data: { path: `${folder}/source.md`, content: body } })
}

async function caretOnTheLink(page: Page): Promise<void> {
  await page.locator('.cm-vixen-link').click()
}

test('Mod-Enter opens the link the caret is in', async ({ page, request }) => {
  const folder = `key-${String(Date.now())}`
  await workspace(request, folder, 'see [the target](target.md) for more\n')

  await page.goto(`/doc/${folder}/source.md`)
  await caretOnTheLink(page)

  await page.keyboard.press('ControlOrMeta+Enter')

  await expect(page.locator('.cm-content')).toContainText('# the target')
  expect(new URL(page.url()).pathname).toBe(`/doc/${folder}/target.md`)

  await request.delete(`/api/files/entries/${folder}`)
})

test('Mod-Enter in ordinary prose navigates nowhere', async ({ page, request }) => {
  const folder = `keyp-${String(Date.now())}`
  await workspace(request, folder, 'plain prose with no link at all\n')

  await page.goto(`/doc/${folder}/source.md`)
  await page.locator('.cm-content').click()
  const { pathname: before } = new URL(page.url())

  await page.keyboard.press('ControlOrMeta+Enter')
  await page.waitForTimeout(300)

  expect(new URL(page.url()).pathname).toBe(before)

  await request.delete(`/api/files/entries/${folder}`)
})

test('Mod-Enter in prose still inserts a blank line, which CodeMirror binds it to', async ({ page, request }) => {
  const folder = `keyb-${String(Date.now())}`
  await workspace(request, folder, 'first line\nsecond line\n')

  await page.goto(`/doc/${folder}/source.md`)
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+Home')

  await page.keyboard.press('ControlOrMeta+Enter')

  await expect(page.locator('#word-count')).toBeVisible()
  expect(await page.locator('.cm-line').count()).toBeGreaterThan(2)

  await request.delete(`/api/files/entries/${folder}`)
})

test('Mod-Enter on an image opens the image view', async ({ page, request }) => {
  const folder = `keyi-${String(Date.now())}`
  await workspace(request, folder, 'here ![a cat](pic.png) inline\n')

  await page.goto(`/doc/${folder}/source.md`)
  await caretOnTheLink(page)

  await page.keyboard.press('ControlOrMeta+Enter')

  await expect(page.locator('#view-image')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(`/doc/${folder}/pic.png`)

  await request.delete(`/api/files/entries/${folder}`)
})
