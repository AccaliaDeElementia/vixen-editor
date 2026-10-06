'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { APIRequestContext } from '@playwright/test'

import { stringFieldOf } from './json.ts'
import { DECODABLE_64PX_PNG_BYTES } from './png.ts'

async function documentShowing(request: APIRequestContext, folder: string, body: string): Promise<string> {
  await request.post('/api/files/folders', { data: { path: folder } })
  const stored = await request.post('/api/files/uploads', {
    multipart: { path: folder, file: { name: 'pic.png', mimeType: 'image/png', buffer: DECODABLE_64PX_PNG_BYTES } },
  })
  expect(await stringFieldOf(stored, 'path')).toBe(`${folder}/pic.png`)

  await request.post('/api/files/documents', { data: { path: `${folder}/notes.md`, content: body } })

  return `/doc/${folder}/notes.md`
}

test('an image alone on its line replaces its source text', async ({ page, request }) => {
  const folder = `img-${String(Date.now())}`
  const url = await documentShowing(request, folder, 'intro\n\n![a cat](pic.png)\n\ntail\n')

  await page.goto(url)

  const image = page.locator('img.cm-vixen-image')
  await givenAsync(expect(image).toHaveAttribute('src', `/api/files/raw/${folder}/pic.png`))
  await givenAsync(expect(image).toHaveAttribute('alt', 'a cat'))

  await expect(page.locator('.cm-content')).not.toContainText('![a cat]')

  await request.delete(`/api/files/entries/${folder}`)
})

test('a rendered image really loads its bytes', async ({ page, request }) => {
  const folder = `imgload-${String(Date.now())}`
  const url = await documentShowing(request, folder, 'intro\n\n![a cat](pic.png)\n\ntail\n')

  await page.goto(url)

  const image = page.locator('img.cm-vixen-image')
  await givenAsync(expect(image).toHaveAttribute('src', `/api/files/raw/${folder}/pic.png`))

  await expect.poll(async () => await image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0)

  await request.delete(`/api/files/entries/${folder}`)
})

test('clicking the image puts the caret in its source, which is how it gets edited', async ({ page, request }) => {
  const folder = `imgclick-${String(Date.now())}`
  const url = await documentShowing(request, folder, 'intro\n\n![a cat](pic.png)\n\ntail\n')

  await page.goto(url)
  const image = page.locator('img.cm-vixen-image')
  await givenAsync(expect(image).toBeVisible())

  await image.click()

  await givenAsync(expect(page.locator('.cm-content')).toContainText('![a cat](pic.png)'))
  await expect(page.locator('img.cm-vixen-image')).toHaveCount(0)

  await request.delete(`/api/files/entries/${folder}`)
})

test('an image that is not there stays as source text', async ({ page, request }) => {
  const folder = `imggone-${String(Date.now())}`
  const url = await documentShowing(request, folder, 'intro\n\n![missing](nowhere.png)\n\ntail\n')

  await page.goto(url)

  await givenAsync(expect(page.locator('.cm-content')).toContainText('![missing](nowhere.png)'))
  await expect(page.locator('img.cm-vixen-image')).toHaveCount(0)

  await request.delete(`/api/files/entries/${folder}`)
})

test('moving the caret away renders the image again', async ({ page, request }) => {
  const folder = `imgcaret-${String(Date.now())}`
  const url = await documentShowing(request, folder, 'intro\n\n![a cat](pic.png)\n\ntail\n')

  await page.goto(url)
  await page.locator('img.cm-vixen-image').click()
  await givenAsync(expect(page.locator('img.cm-vixen-image')).toHaveCount(0))

  await page.locator('.cm-content').click({ position: { x: 5, y: 5 } })

  await expect(page.locator('img.cm-vixen-image')).toHaveCount(1)

  await request.delete(`/api/files/entries/${folder}`)
})
