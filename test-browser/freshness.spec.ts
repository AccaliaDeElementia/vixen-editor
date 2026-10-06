'use sanity'

import { given, givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { stringFieldOf } from './json.ts'

test('a clean buffer reloads when the document changes underneath it', async ({ page, request }) => {
  const name = `fresh-${String(Date.now())}.md`
  const created = await request.post('/api/files/documents', { data: { path: name, content: '# first' } })
  const etag = await stringFieldOf(created, 'etag')

  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('# first'))

  await request.put(`/api/documents/${name}`, {
    headers: { 'if-match': etag, 'content-type': 'application/json' },
    data: { content: '# changed by someone else' },
  })

  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
  })

  await givenAsync(expect(page.locator('.cm-content')).toContainText('# changed by someone else'))
  await expect(page.locator('#status .toast').last()).toContainText('reloaded')

  await request.delete(`/api/files/entries/${name}`)
})

test('a change the server announces reloads the document with no prompting at all', async ({ page, request }) => {
  const name = `announced-${String(Date.now())}.md`
  const created = await request.post('/api/files/documents', { data: { path: name, content: '# first' } })
  const etag = await stringFieldOf(created, 'etag')

  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('# first'))

  await request.put(`/api/documents/${name}`, {
    headers: { 'if-match': etag, 'content-type': 'application/json' },
    data: { content: '# announced by the server' },
  })

  await expect(page.locator('.cm-content')).toContainText('# announced by the server')

  await request.delete(`/api/files/entries/${name}`)
})

test('an unchanged document costs no body', async ({ request }) => {
  const name = `nochange-${String(Date.now())}.md`
  const created = await request.post('/api/files/documents', { data: { path: name, content: '# steady' } })
  const etag = await stringFieldOf(created, 'etag')

  const res = await request.get(`/api/documents/${name}`, { headers: { 'if-none-match': etag } })

  given(() => {
    expect(res.status()).toBe(304)
  })
  expect(await res.text()).toBe('')

  await request.delete(`/api/files/entries/${name}`)
})
