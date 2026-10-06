'use sanity'

import { given } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { stringFieldOf } from './json.ts'

test('the built entry point boots and answers its health check', async ({ request }) => {
  const res = await request.get('/api/health')

  const body: unknown = await res.json()

  expect({ status: res.status(), body }).toStrictEqual({ status: 200, body: { status: 'ok' } })
})

test('every response from the real process carries the clacks header', async ({ request }) => {
  const paths = ['/api/health', '/', '/assets/main.js', '/api/documents/missing.md', '/api/documents/bad.zip']

  const overheads = await Promise.all(
    paths.map(async (path) => {
      const res = await request.get(path)
      const sent = res.headersArray().find((header) => header.name.toLowerCase() === 'x-clacks-overhead')

      return `${path} -> ${sent === undefined ? 'MISSING' : `${sent.name}: ${sent.value}`}`
    }),
  )

  expect(overheads).toStrictEqual(paths.map((path) => `${path} -> X-Clacks-Overhead: GNU Terry Pratchett`))
})

test('renders the editor page from the pug template', async ({ request }) => {
  const res = await request.get('/')
  const html = await res.text()

  given(() => {
    expect({ status: res.status(), contentType: res.headers()['content-type'] }).toStrictEqual({
      status: 200,
      contentType: 'text/html; charset=UTF-8',
    })
  })

  expect({
    doctype: html.startsWith('<!DOCTYPE html>'),
    title: html.includes('<title>Vixen Editor</title>'),
    mount: html.includes('id="editor"'),
  }).toStrictEqual({ doctype: true, title: true, mount: true })
})

test('renders all three columns and no header or footer', async ({ request }) => {
  const html = await (await request.get('/')).text()

  expect({
    ribbon: html.includes('class="ribbon"'),
    explorer: html.includes('id="explorer"'),
    workspace: html.includes('class="workspace"'),
    header: html.includes('<header'),
    footer: html.includes('<footer'),
  }).toStrictEqual({ ribbon: true, explorer: true, workspace: true, header: false, footer: false })
})

test('serves the self-hosted icon font', async ({ request }) => {
  const res = await request.get('/assets/material-symbols-outlined.woff2')

  given(() => {
    expect(res.status()).toBe(200)
  })

  expect((await res.body()).subarray(0, 4).toString('latin1')).toBe('wOF2')
})

test('serves the compiled stylesheet at the path the page asks for', async ({ request }) => {
  const page = await (await request.get('/')).text()
  const href = /<link[^>]+rel="stylesheet"[^>]+href="(?<href>\/assets[^"]+)"/v.exec(page)?.groups?.href

  given(() => {
    expect(href).toBe('/assets/main.css')
  })

  const stylesheet = await request.get(href ?? '')
  given(() => {
    expect(stylesheet.status()).toBe(200)
  })

  expect(await stylesheet.text()).toContain('.cm-vixen-heading')
})

test('serves the built client bundle at the path the page asks for', async ({ request }) => {
  const page = await (await request.get('/')).text()
  const src = /<script[^>]+src="(?<src>[^"]+)"/v.exec(page)?.groups?.src

  given(() => {
    expect(src).toBe('/assets/main.js')
  })

  const bundle = await request.get(src ?? '')

  expect(bundle.status()).toBe(200)
})

test('round-trips a document through the real process', async ({ request }) => {
  const id = `boot-${String(Date.now())}.md`

  const created = await request.post('/api/files/documents', { data: { path: id, content: '# booted' } })
  given(() => {
    expect(created.status()).toBe(201)
  })
  const etag = await stringFieldOf(created, 'etag')

  const written = await request.put(`/api/documents/${id}`, {
    data: { content: '# edited' },
    headers: { 'if-match': etag },
  })
  given(() => {
    expect(written.status()).toBe(204)
  })

  const read = await request.get(`/api/documents/${id}`)
  given(() => {
    expect(read.status()).toBe(200)
  })

  expect(await read.text()).toBe('# edited')

  const trashed = await request.delete(`/api/files/entries/${id}`)
  const trashId = await stringFieldOf(trashed, 'trashId')
  const purged = await request.delete(`/api/trash/${trashId}`)
  given(() => {
    expect({ trashed: trashed.status(), purged: purged.status() }).toStrictEqual({ trashed: 200, purged: 204 })
  })
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

  const stored = await request.get(`/api/documents/${id}`).then(async (r) => await r.text())

  expect({ status: stale.status(), stored }).toStrictEqual({ status: 412, stored: '# theirs' })
  await request.delete(`/api/files/entries/${id}`)
})

test('rejects a traversal attempt against the real process', async ({ request }) => {
  const res = await request.get('/api/documents/..%2F..%2Fetc%2Fpasswd.md')

  expect(res.status()).toBe(400)
})

test('the real process sends the root to the document view', async ({ request }) => {
  const res = await request.get('/', { maxRedirects: 0 })

  expect({ status: res.status(), location: res.headers().location }).toStrictEqual({
    status: 302,
    location: '/doc/',
  })
})

test('the real process gives a folder url its trailing slash', async ({ request }) => {
  const res = await request.get('/doc/journal/2026', { maxRedirects: 0 })

  expect({ status: res.status(), location: res.headers().location }).toStrictEqual({
    status: 302,
    location: '/doc/journal/2026/',
  })
})

test('the real process serves the editor shell for a document url', async ({ request }) => {
  const res = await request.get('/doc/notes.md')

  given(() => {
    expect(res.status()).toBe(200)
  })

  expect(await res.text()).toContain('id="editor"')
})
