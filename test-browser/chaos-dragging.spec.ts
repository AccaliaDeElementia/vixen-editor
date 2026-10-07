'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

test('a drag survives another client changing the store while it is in flight', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `chaosdrag-${stamp}`
  const doc = `carried-${stamp}.md`
  const noise = `anoise-${stamp}.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: doc } })

  await page.goto('/doc/')
  await givenAsync(expect(page.locator(`.tree__row[data-path="${doc}"]`)).toBeVisible())
  await page.locator(`.tree__row[data-path="${doc}"]`).hover()
  await page.mouse.down()

  await request.post('/api/files/documents', { data: { path: noise, content: '# elsewhere' } })
  await page.locator(`.tree__row[data-path="${folder}"]`).hover()
  await page.locator(`.tree__row[data-path="${folder}"]`).hover()
  await page.mouse.up()

  await expect(page.locator(`.tree__row[data-path="${folder}/${doc}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${folder}`)
  await request.delete(`/api/files/entries/${noise}`)
})

test('a press on empty tree space releases wherever it ends', async ({ page, request }) => {
  const stamp = String(Date.now())
  const mine = `chaospress-${stamp}.md`
  const arrives = `aarrives-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: mine, content: '# mine' } })

  await page.goto(`/doc/${mine}`)
  await givenAsync(expect(page.locator(`.tree__row[data-path="${mine}"]`)).toBeVisible())
  const tree = await page.locator('#file-tree').boundingBox()
  if (tree === null) throw new Error('the tree has no box')
  await page.mouse.move(tree.x + tree.width / 2, tree.y + tree.height - 4)
  await page.mouse.down()

  await request.post('/api/files/documents', { data: { path: arrives, content: '# later' } })
  await page.locator('.cm-content').hover()
  await page.mouse.up()

  await expect(page.locator(`.tree__row[data-path="${arrives}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${mine}`)
  await request.delete(`/api/files/entries/${arrives}`)
})
