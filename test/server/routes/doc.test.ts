'use sanity'

import { describe, expect, it } from 'vitest'

import { DOC_PREFIX, docRoutes, TestOnly } from '../../../src/server/routes/doc.ts'

const { folderRedirectTarget } = TestOnly

const app = docRoutes(() => '<html lang="en"><body><div id="editor"></div></body></html>')

describe('folderRedirectTarget', () => {
  it.each([
    ['a bare folder', 'journal', '/doc/journal/'],
    ['a nested folder', 'journal/2026', '/doc/journal/2026/'],
    ['a folder whose name looks like a filename', 'v1.2', '/doc/v1.2/'],
    ['a folder with an unopenable extension', 'notes.zip', '/doc/notes.zip/'],
  ])('redirects %s', (_label, rest, expected) => {
    expect(folderRedirectTarget(rest)).toBe(expected)
  })

  it.each([
    ['the doc root, which already ends in a slash', ''],
    ['a folder that already has its slash', 'journal/'],
    ['a markdown document', 'notes.md'],
    ['a plain text document', 'notes.txt'],
    ['an image', 'photo.png'],
    ['a nested document', 'journal/2026/september.md'],
  ])('leaves %s alone', (_label, rest) => {
    expect(folderRedirectTarget(rest)).toBeNull()
  })
})

describe('GET /', () => {
  it('sends the browser to the document view, which is the app', async () => {
    const res = await app.request('/')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(DOC_PREFIX)
  })

  it('redirects temporarily, because a permanent one is cached forever', async () => {
    expect((await app.request('/')).status).not.toBe(301)
  })
})

describe('GET /doc', () => {
  it('redirects to the slashed form', async () => {
    const res = await app.request('/doc')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(DOC_PREFIX)
  })
})

describe('GET /doc/**', () => {
  it('renders the editor shell at the doc root', async () => {
    const res = await app.request('/doc/')

    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toContain('id="editor"')
  })

  it('renders the shell for a document path', async () => {
    const res = await app.request('/doc/journal/2026/september.md')

    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toContain('id="editor"')
  })

  it('adds the trailing slash to a folder, so relative image links resolve', async () => {
    const res = await app.request('/doc/journal/2026')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/doc/journal/2026/')
  })

  it('renders the shell once the folder url carries its slash', async () => {
    expect((await app.request('/doc/journal/2026/')).status).toBe(200)
  })

  it('serves html, not the document itself', async () => {
    const res = await app.request('/doc/notes.md')

    expect(res.headers.get('content-type')).toContain('text/html')
  })
})
