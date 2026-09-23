'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp, CLACKS_HEADER, CLACKS_VALUE } from '../../src/server/app.ts'
import { createApp } from '../../src/server/main.ts'
import type { Config } from '../../src/server/config.ts'
import { createFsDocumentStore, type DocumentStore } from '../../src/server/storage/fs-store.ts'
import { failingStore } from './failing-store.ts'

let workspace: string
let publicDir: string
let docsRoot: string
let templatesDir: string
let store: DocumentStore

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-clacks-'))
  publicDir = path.join(workspace, 'public')
  docsRoot = path.join(workspace, 'docs')
  templatesDir = path.join(workspace, 'templates')
  await fs.mkdir(path.join(publicDir, 'assets'), { recursive: true })
  await fs.mkdir(templatesDir, { recursive: true })
  await fs.writeFile(path.join(publicDir, 'assets', 'main.js'), 'export const built = true')
  await fs.writeFile(path.join(templatesDir, 'editor.pug'), 'h1= title')
  store = createFsDocumentStore(docsRoot)
})

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true })
})

function configFor(): Config {
  return { port: 3000, host: '0.0.0.0', docsRoot, templatesDir, logLevel: 'info', nodeEnv: 'test' }
}

function clacksOf(res: Response): string | null {
  return res.headers.get(CLACKS_HEADER)
}

describe('the overhead', () => {
  it('is addressed to the right man', () => {
    expect(CLACKS_HEADER).toBe('X-Clacks-Overhead')
    expect(CLACKS_VALUE).toBe('GNU Terry Pratchett')
  })
})

describe('every api response carries the clacks header', () => {
  it('on a 200', async () => {
    const res = await buildApp({ store }).request('/api/health')

    expect(res.status).toBe(200)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })

  it('on a document read', async () => {
    await store.createDocument('notes.md', '# hello')
    const res = await buildApp({ store }).request('/api/documents/notes.md')

    expect(res.status).toBe(200)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })

  it('on a 404 for a missing document', async () => {
    const res = await buildApp({ store }).request('/api/documents/missing.md')

    expect(res.status).toBe(404)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })

  it('on a 404 for an unrouted path', async () => {
    const res = await buildApp({ store }).request('/api/nope')

    expect(res.status).toBe(404)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })

  it('on a 400 for a rejected document id', async () => {
    const res = await buildApp({ store }).request('/api/documents/evil.zip')

    expect(res.status).toBe(400)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })

  it('on a 400 raised as an HTTPException by a malformed body', async () => {
    const res = await buildApp({ store }).request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    })

    expect(res.status).toBe(400)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })

  it('on a 500 from an unexpected storage fault', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/documents/notes.md')

    expect(res.status).toBe(500)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })

  it('on a 204 from a delete', async () => {
    await store.createDocument('notes.md', 'x')
    const res = await buildApp({ store }).request('/api/documents/notes.md', { method: 'DELETE' })

    expect(res.status).toBe(204)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })
})

describe('static responses carry it too', () => {
  it('on the served page', async () => {
    const res = await createApp(configFor(), publicDir).request('/')

    expect(res.status).toBe(200)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })

  it('on a served asset', async () => {
    const res = await createApp(configFor(), publicDir).request('/assets/main.js')

    expect(res.status).toBe(200)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })

  it('on an asset that was never built', async () => {
    const res = await createApp(configFor(), publicDir).request('/assets/missing.js')

    expect(res.status).toBe(404)
    expect(clacksOf(res)).toBe(CLACKS_VALUE)
  })
})
