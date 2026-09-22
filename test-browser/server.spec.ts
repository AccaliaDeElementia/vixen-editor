'use sanity'

import { expect, test } from '@playwright/test'

test('the built entry point boots and answers its health check', async ({ request }) => {
  const res = await request.get('/api/health')

  expect(res.status()).toBe(200)
  expect(await res.json()).toStrictEqual({ status: 'ok' })
})

test('every response from the real process carries the clacks header', async ({ request }) => {
  const paths = ['/api/health', '/', '/assets/main.js', '/api/documents/missing.md', '/api/documents/bad.txt']

  const overheads = await Promise.all(
    paths.map(async (path) => {
      const res = await request.get(path)
      return `${path} -> ${res.headers()['x-clacks-overhead'] ?? 'MISSING'}`
    }),
  )

  expect(overheads).toStrictEqual(paths.map((path) => `${path} -> GNU Terry Pratchett`))
})

test('serves the editor page from the static mount', async ({ request }) => {
  const res = await request.get('/')

  expect(res.status()).toBe(200)
  expect(await res.text()).toContain('id="editor"')
})

test('serves the built client bundle at the path index.html asks for', async ({ request }) => {
  const page = await (await request.get('/')).text()
  const src = /<script[^>]+src="(?<src>[^"]+)"/u.exec(page)?.groups?.src

  expect(src).toBe('/assets/main.js')

  const bundle = await request.get(src ?? '')
  expect(bundle.status()).toBe(200)
})

test('round-trips a document through the real process', async ({ request }) => {
  const id = `boot-${String(Date.now())}.md`

  const written = await request.put(`/api/documents/${id}`, { data: { content: '# booted' } })
  expect(written.status()).toBe(204)

  const read = await request.get(`/api/documents/${id}`)
  expect(read.status()).toBe(200)
  expect(await read.text()).toBe('# booted')

  expect((await request.delete(`/api/documents/${id}`)).status()).toBe(204)
})

test('rejects a traversal attempt against the real process', async ({ request }) => {
  const res = await request.get('/api/documents/..%2F..%2Fetc%2Fpasswd.md')

  expect(res.status()).toBe(400)
})
