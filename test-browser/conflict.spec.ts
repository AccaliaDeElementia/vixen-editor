'use sanity'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { stringFieldOf } from './json.ts'

async function conflicting(page: Page, request: APIRequestContext, name: string): Promise<void> {
  const created = await request.post('/api/files/documents', { data: { path: name, content: '# first' } })
  const etag = await stringFieldOf(created, 'etag')

  await page.goto(`/doc/${name}`)
  await page.locator('.cm-content').click()
  await page.keyboard.type('mine ')

  await request.put(`/api/documents/${name}`, {
    headers: { 'if-match': etag, 'content-type': 'application/json' },
    data: { content: '# changed by someone else' },
  })
}

async function noticeTheChange(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
  })
}

async function storedAt(request: APIRequestContext, name: string): Promise<string> {
  return await request.get(`/api/documents/${name}`).then(async (response) => await response.text())
}

test('a dirty buffer is offered the three resolutions, with none of them the default', async ({ page, request }) => {
  const name = `conflict-offer-${String(Date.now())}.md`
  await conflicting(page, request, name)

  await noticeTheChange(page)

  await expect(page.locator('#file-dialog-choices button')).toHaveCount(3)
  await expect(page.locator('#file-dialog-field')).toBeHidden()
  await expect(page.locator('#file-dialog-cancel')).toBeFocused()
  await expect(page.locator('.cm-content')).toContainText('mine')

  await page.locator('#file-dialog-cancel').click()
  await request.delete(`/api/files/entries/${name}`)
})

test('dismissing the resolutions leaves the buffer and says it cannot be saved', async ({ page, request }) => {
  const name = `conflict-dismiss-${String(Date.now())}.md`
  await conflicting(page, request, name)

  await noticeTheChange(page)
  await page.locator('#file-dialog-cancel').click()

  await expect(page.locator('#status .toast').last()).toContainText('can no longer be saved')
  await expect(page.locator('.cm-content')).toContainText('mine')
  await expect(page.locator('.cm-content')).not.toContainText('changed by someone else')

  await request.delete(`/api/files/entries/${name}`)
})

test('taking theirs replaces the buffer with what is stored', async ({ page, request }) => {
  const name = `conflict-theirs-${String(Date.now())}.md`
  await conflicting(page, request, name)

  await noticeTheChange(page)
  await page.locator('#file-dialog-choices button[value="theirs"]').click()

  await expect(page.locator('.cm-content')).toContainText('# changed by someone else')
  await expect(page.locator('.cm-content')).not.toContainText('mine')

  await request.delete(`/api/files/entries/${name}`)
})

test('keeping mine overwrites the store with the buffer', async ({ page, request }) => {
  const name = `conflict-mine-${String(Date.now())}.md`
  await conflicting(page, request, name)

  await noticeTheChange(page)
  await page.locator('#file-dialog-choices button[value="mine"]').click()

  await expect(page.locator('#save-label')).toHaveText('Saved')
  expect(await storedAt(request, name)).toContain('mine')
  expect(await storedAt(request, name)).not.toContain('changed by someone else')

  await request.delete(`/api/files/entries/${name}`)
})

test('keeping both writes the buffer to a second document and then loads theirs', async ({ page, request }) => {
  const name = `conflict-both-${String(Date.now())}.md`
  const kept = name.replace('.md', '-mine.md')
  await conflicting(page, request, name)

  await noticeTheChange(page)
  await page.locator('#file-dialog-choices button[value="both"]').click()

  await expect(page.locator('#file-dialog-entry')).toHaveValue(kept)
  await page.locator('#file-dialog-confirm').click()

  await expect(page.locator('.cm-content')).toContainText('# changed by someone else')
  expect(await storedAt(request, kept)).toContain('mine')
  expect(await storedAt(request, name)).toContain('changed by someone else')

  await request.delete(`/api/files/entries/${name}`)
  await request.delete(`/api/files/entries/${kept}`)
})

test('a save the store refuses as stale offers the resolutions at once', async ({ page, request }) => {
  const name = `conflict-save-${String(Date.now())}.md`
  await conflicting(page, request, name)

  await page.keyboard.press('Control+s')

  await expect(page.locator('#file-dialog-choices button')).toHaveCount(3)

  await page.locator('#file-dialog-cancel').click()
  await request.delete(`/api/files/entries/${name}`)
})
