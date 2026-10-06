'use sanity'

import { given, givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { storedDocument } from './fixtures.ts'

test('persists a document across a reload', async ({ page, request }) => {
  const doc = `persist-${String(Date.now())}.md`

  await page.goto(await storedDocument(request, doc))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('# persisted content')
  await page.keyboard.press('Control+s')
  await givenAsync(expect(page.locator('#status')).toContainText('Saved'))

  await page.reload()

  await expect(page.locator('.cm-content')).toContainText('# persisted content')
})

test('an edit is saved on the way out, without asking', async ({ page, request }) => {
  const first = `leave-a-${String(Date.now())}.md`
  const second = `leave-b-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })

  await page.goto(`/doc/${first}`)
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('# edited on the way out')

  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()
  await givenAsync(expect(page.locator('.cm-content')).toContainText('# second'))
  await givenAsync(expect(page.locator('#file-dialog')).toBeHidden())

  await page.goto(`/doc/${first}`)
  await expect(page.locator('.cm-content')).toContainText('# edited on the way out')

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('an empty buffer blocks the way out', async ({ page, request }) => {
  const first = `empty-a-${String(Date.now())}.md`
  const second = `empty-b-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })

  await page.goto(`/doc/${first}`)
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')

  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()

  await givenAsync(expect(page.locator('#file-dialog-message')).toContainText('Empty documents are not stored'))
  await givenAsync(expect(page.locator('#file-dialog-message')).toContainText('discards the changes'))
  given(() => {
    expect(new URL(page.url()).pathname).toBe(`/doc/${first}`)
  })

  await page.locator('#file-dialog-cancel').click()
  expect(new URL(page.url()).pathname).toBe(`/doc/${first}`)

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('discarding lets the navigation through', async ({ page, request }) => {
  const first = `discard-a-${String(Date.now())}.md`
  const second = `discard-b-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })

  await page.goto(`/doc/${first}`)
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')

  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()
  await givenAsync(expect(page.locator('#file-dialog-confirm')).toBeVisible())
  await page.locator('#file-dialog-confirm').click()

  await givenAsync(expect(page.locator('.cm-content')).toContainText('# second'))
  given(() => {
    expect(new URL(page.url()).pathname).toBe(`/doc/${second}`)
  })

  await page.goto(`/doc/${first}`)
  await expect(page.locator('.cm-content')).toContainText('# first')

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('saving surfaces a toast that then fades', async ({ page, request }) => {
  const name = `toast-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# seed' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-editor')).toBeVisible())

  const toast = page.locator('#status .toast')
  await givenAsync(expect(toast).toBeVisible())
  await givenAsync(expect(toast).toContainText('Editing'))

  await expect(toast).toHaveCount(0, { timeout: 5000 })
})
