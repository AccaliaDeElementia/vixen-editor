'use sanity'

import { expect, test } from '@playwright/test'

import { stringFieldOf } from './json.ts'

test('the built entry point boots and answers its health check', async ({ request }) => {
  const res = await request.get('/api/health')

  expect(res.status()).toBe(200)
  expect(await res.json()).toStrictEqual({ status: 'ok' })
})

test('every response from the real process carries the clacks header', async ({ request }) => {
  const paths = ['/api/health', '/', '/assets/main.js', '/api/documents/missing.md', '/api/documents/bad.zip']

  const overheads = await Promise.all(
    paths.map(async (path) => {
      const res = await request.get(path)
      return `${path} -> ${res.headers()['x-clacks-overhead'] ?? 'MISSING'}`
    }),
  )

  expect(overheads).toStrictEqual(paths.map((path) => `${path} -> GNU Terry Pratchett`))
})

test('renders the editor page from the pug template', async ({ request }) => {
  const res = await request.get('/')
  const html = await res.text()

  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/html')
  expect(html).toContain('id="editor"')
  expect(html).toContain('<title>Vixen Editor</title>')
  expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
})

test('renders all three columns and no header or footer', async ({ request }) => {
  const html = await (await request.get('/')).text()

  expect(html).toContain('class="ribbon"')
  expect(html).toContain('id="explorer"')
  expect(html).toContain('class="workspace"')
  expect(html).not.toContain('<header')
  expect(html).not.toContain('<footer')
})

test('serves the self-hosted icon font', async ({ request }) => {
  const res = await request.get('/assets/material-symbols-outlined.woff2')

  expect(res.status()).toBe(200)
  expect((await res.body()).subarray(0, 4).toString('latin1')).toBe('wOF2')
})

test('serves the compiled stylesheet at the path the page asks for', async ({ request }) => {
  const page = await (await request.get('/')).text()
  const href = /<link[^>]+rel="stylesheet"[^>]+href="(?<href>\/assets[^"]+)"/v.exec(page)?.groups?.href

  expect(href).toBe('/assets/main.css')

  const stylesheet = await request.get(href ?? '')
  expect(stylesheet.status()).toBe(200)
  expect(await stylesheet.text()).toContain('#222222')
})

test('serves the built client bundle at the path the page asks for', async ({ request }) => {
  const page = await (await request.get('/')).text()
  const src = /<script[^>]+src="(?<src>[^"]+)"/v.exec(page)?.groups?.src

  expect(src).toBe('/assets/main.js')

  const bundle = await request.get(src ?? '')
  expect(bundle.status()).toBe(200)
})

test('round-trips a document through the real process', async ({ request }) => {
  const id = `boot-${String(Date.now())}.md`

  const created = await request.post('/api/files/documents', { data: { path: id, content: '# booted' } })
  expect(created.status()).toBe(201)
  const etag = await stringFieldOf(created, 'etag')

  const written = await request.put(`/api/documents/${id}`, {
    data: { content: '# edited' },
    headers: { 'if-match': etag },
  })
  expect(written.status()).toBe(204)

  const read = await request.get(`/api/documents/${id}`)
  expect(read.status()).toBe(200)
  expect(await read.text()).toBe('# edited')

  const trashed = await request.delete(`/api/files/entries/${id}`)
  expect(trashed.status()).toBe(200)

  const trashId = await stringFieldOf(trashed, 'trashId')
  expect((await request.delete(`/api/trash/${trashId}`)).status()).toBe(204)
})

test('rejects a stale save against the real process', async ({ request }) => {
  const id = `stale-${String(Date.now())}.md`

  const created = await request.post('/api/files/documents', { data: { path: id, content: '# first' } })
  const etag = await stringFieldOf(created, 'etag')
  await request.put(`/api/documents/${id}`, { data: { content: '# theirs' }, headers: { 'if-match': etag } })

  const stale = await request.put(`/api/documents/${id}`, {
    data: { content: '# mine' },
    headers: { 'if-match': etag },
  })

  expect(stale.status()).toBe(412)
  expect(await request.get(`/api/documents/${id}`).then(async (r) => await r.text())).toBe('# theirs')
  await request.delete(`/api/files/entries/${id}`)
})

test('rejects a traversal attempt against the real process', async ({ request }) => {
  const res = await request.get('/api/documents/..%2F..%2Fetc%2Fpasswd.md')

  expect(res.status()).toBe(400)
})

test('the real process sends the root to the document view', async ({ request }) => {
  const res = await request.get('/', { maxRedirects: 0 })

  expect(res.status()).toBe(302)
  expect(res.headers().location).toBe('/doc/')
})

test('the real process gives a folder url its trailing slash', async ({ request }) => {
  const res = await request.get('/doc/journal/2026', { maxRedirects: 0 })

  expect(res.status()).toBe(302)
  expect(res.headers().location).toBe('/doc/journal/2026/')
})

test('the real process serves the editor shell for a document url', async ({ request }) => {
  const res = await request.get('/doc/notes.md')

  expect(res.status()).toBe(200)
  expect(await res.text()).toContain('id="editor"')
})
