'use sanity'

import { given, givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

test('a real drag moves a document into a folder', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `dragdest-${stamp}`
  const doc = `dragged-${stamp}.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: doc } })

  await page.goto('/doc/')
  const source = page.locator(`.tree__row[data-path="${doc}"]`)
  const target = page.locator(`.tree__row[data-path="${folder}"]`)

  await givenAsync(expect(source).toHaveAttribute('draggable', 'true'))
  await source.dragTo(target)

  await givenAsync(expect(page.locator(`.tree__row[data-path="${folder}/${doc}"]`)).toBeVisible())
  await expect(page.locator(`.tree__row[data-path="${doc}"]`)).toHaveCount(0)

  await request.delete(`/api/files/entries/${folder}`)
})

test('a real drag shows the drop affordance only where a drop is legal', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `affordance-${stamp}`
  const document_ = `affordance-${stamp}.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: document_, content: '# leaf' } })

  await page.goto('/doc/')
  const source = page.locator(`.tree__row[data-path="${folder}"]`)
  const leaf = page.locator(`.tree__row[data-path="${document_}"]`)
  await givenAsync(expect(leaf).toBeVisible())

  await source.hover()
  await page.mouse.down()
  await leaf.hover()

  await expect(leaf).not.toHaveClass(/tree__row--drop/v)
  await page.mouse.up()

  await request.delete(`/api/files/entries/${folder}`)
  await request.delete(`/api/files/entries/${document_}`)
})

test('a real drag reveals the moved document at its new location', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `reveal-${stamp}`
  const doc = `moving-${stamp}.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: doc } })

  await page.goto('/doc/')
  await page.locator(`.tree__row[data-path="${doc}"]`).dragTo(page.locator(`.tree__row[data-path="${folder}"]`))

  const moved = page.locator(`.tree__row[data-path="${folder}/${doc}"]`)
  await givenAsync(expect(moved).toBeVisible())
  await expect(moved).toHaveAttribute('aria-selected', 'true')

  await request.delete(`/api/files/entries/${folder}`)
})

test('dragging the open document follows it in the address bar and keeps saving', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `followdest-${stamp}`
  const doc = `followed-${stamp}.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: doc, content: '# before\n' } })

  await page.goto(`/doc/${doc}`)
  await givenAsync(expect(page.locator('#editor .cm-content')).toContainText('# before'))

  await page.locator(`.tree__row[data-path="${doc}"]`).dragTo(page.locator(`.tree__row[data-path="${folder}"]`))

  await givenAsync(expect(page).toHaveURL(`/doc/${folder}/${doc}`))
  await givenAsync(expect(page.locator('#status')).toContainText(`Editing ${folder}/${doc}`))

  await page.locator('#editor .cm-content').click()
  await page.keyboard.type(' edited')
  await givenAsync(expect(page.locator('#editor .cm-content')).toContainText('# before edited'))
  await page.keyboard.press('ControlOrMeta+s')
  await givenAsync(expect(page.locator('#status')).toContainText('Saved'))

  const moved = await request.get(`/api/documents/${folder}/${doc}`)
  given(() => {
    expect(moved.status()).toBe(200)
  })
  expect(await moved.text()).toContain('edited')

  await request.delete(`/api/files/entries/${folder}`)
})
