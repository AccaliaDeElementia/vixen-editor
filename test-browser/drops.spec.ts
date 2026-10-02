'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

import { storedImage } from './fixtures.ts'

import { DECODABLE_64PX_PNG_BYTES } from './png.ts'

test('dragging a document from the tree inserts a link at the drop point', async ({ page, request }) => {
  const stamp = String(Date.now())
  const open = `dropinto-${stamp}.md`
  const dragged = `dragged-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: open, content: 'before after' } })
  await request.post('/api/files/documents', { data: { path: dragged, content: '# dragged' } })

  await page.goto(`/doc/${open}`)
  await givenAsync(expect(page.locator(`[role="treeitem"][data-path="${dragged}"]`)).toBeVisible())

  await page.locator(`[role="treeitem"][data-path="${dragged}"]`).dragTo(page.locator('.cm-content'))

  await expect(page.locator('.cm-content')).toContainText(`[${dragged}](${dragged})`)

  await request.delete(`/api/files/entries/${open}`)
  await request.delete(`/api/files/entries/${dragged}`)
})

test('dragging an image inserts an embed rather than a link', async ({ page, request }) => {
  const stamp = String(Date.now())
  const open = `embedinto-${stamp}.md`
  const image = `dragged-${stamp}.png`
  await request.post('/api/files/documents', { data: { path: open, content: 'here' } })
  await storedImage(request, image)

  await page.goto(`/doc/${open}`)
  await givenAsync(expect(page.locator(`[role="treeitem"][data-path="${image}"]`)).toBeVisible())

  await page.locator(`[role="treeitem"][data-path="${image}"]`).dragTo(page.locator('.cm-content'))

  await expect(page.locator('.cm-content')).toContainText(`![${image}](${image})`)

  await request.delete(`/api/files/entries/${open}`)
  await request.delete(`/api/files/entries/${image}`)
})

test('a file dropped from outside is uploaded beside the document and embedded', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `osdrop-${stamp}`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: `${folder}/notes.md`, content: 'here' } })

  await page.goto(`/doc/${folder}/notes.md`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('here'))

  const dropped = `dropped-${stamp}.png`
  await page.locator('.cm-content').evaluate(
    (content, [name, base64]) => {
      const bytes = Uint8Array.from(atob(base64 ?? ''), (character) => character.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], name ?? '', { type: 'image/png' }))
      content.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    },
    [dropped, DECODABLE_64PX_PNG_BYTES.toString('base64')],
  )

  await givenAsync(expect(page.locator('.cm-content')).toContainText(`![${dropped}](${dropped})`))

  const stored = await request.get(`/api/files/raw/${folder}/${dropped}`)
  expect(stored.status()).toBe(200)

  await request.delete(`/api/files/entries/${folder}`)
})
