'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { HttpBindings } from '@hono/node-server'
import type { Hono } from 'hono'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/server/app.ts'
import { withClacks, TestOnly as clacksTestOnly } from '../../src/server/clacks.ts'
import { TestOnly as mainTestOnly } from '../../src/server/main.ts'
import { DEFAULT_LIMITS, type Config } from '../../src/server/config.ts'
import { DEFAULT_WRITE_LOCK_TIMEOUT_MS } from '../../src/server/storage/lock.ts'
import { createFsDocumentStore, type DocumentStore } from '../../src/server/storage/fs-store.ts'
import { cast } from '../cast.ts'
import { given } from '../conditions.ts'
import { failingStore } from './failing-store.ts'

const { createApp } = mainTestOnly
const { CLACKS_HEADER, CLACKS_VALUE } = clacksTestOnly

const ORIGIN = 'http://localhost'
const OVERHEAD: Array<[string, string]> = [[CLACKS_HEADER, CLACKS_VALUE]]

let workspace = ''
let publicDir = ''
let docsRoot = ''
let templatesDir = ''
let store: DocumentStore = createFsDocumentStore('')

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
  return {
    port: 3000,
    host: '0.0.0.0',
    docsRoot,
    templatesDir,
    logLevel: 'info',
    nodeEnv: 'test',
    writeLockTimeoutMs: DEFAULT_WRITE_LOCK_TIMEOUT_MS,
    limits: DEFAULT_LIMITS,
  }
}

interface Answer {
  res: Response
  headersWritten: Array<[string, string]>
}

async function answeredBy(app: Hono, requested: string, init?: RequestInit): Promise<Answer> {
  const headersWritten: Array<[string, string]> = []
  const env = cast<HttpBindings>({
    outgoing: {
      setHeader: (name: string, value: string) => {
        headersWritten.push([name, value])
      },
    },
  })

  const res = await withClacks(app.fetch)(new Request(`${ORIGIN}${requested}`, init), env)

  return { res, headersWritten }
}

describe('the overhead', () => {
  it('is addressed to the right man', () => {
    expect({ header: CLACKS_HEADER, value: CLACKS_VALUE }).toStrictEqual({
      header: 'X-Clacks-Overhead',
      value: 'GNU Terry Pratchett',
    })
  })

  it('hands back the response the app produced, so wrapping costs the caller nothing', async () => {
    const { res } = await answeredBy(buildApp({ store }), '/api/health')

    await expect(res.json()).resolves.toStrictEqual({ status: 'ok' })
  })
})

describe('every api response carries the clacks header', () => {
  it('on a 200', async () => {
    const { res, headersWritten } = await answeredBy(buildApp({ store }), '/api/health')

    given(() => {
      expect(res.status).toBe(200)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })

  it('on a document read', async () => {
    await store.createDocument('notes.md', '# hello')
    const { res, headersWritten } = await answeredBy(buildApp({ store }), '/api/documents/notes.md')

    given(() => {
      expect(res.status).toBe(200)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })

  it('on a 404 for a missing document', async () => {
    const { res, headersWritten } = await answeredBy(buildApp({ store }), '/api/documents/missing.md')

    given(() => {
      expect(res.status).toBe(404)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })

  it('on a 404 for an unrouted path', async () => {
    const { res, headersWritten } = await answeredBy(buildApp({ store }), '/api/nope')

    given(() => {
      expect(res.status).toBe(404)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })

  it('on a 400 for a rejected document id', async () => {
    const { res, headersWritten } = await answeredBy(buildApp({ store }), '/api/documents/evil.zip')

    given(() => {
      expect(res.status).toBe(400)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })

  it('on a 400 raised as an HTTPException by a malformed body', async () => {
    const { res, headersWritten } = await answeredBy(buildApp({ store }), '/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    })

    given(() => {
      expect(res.status).toBe(400)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })

  it('on a 500 from an unexpected storage fault', async () => {
    const { res, headersWritten } = await answeredBy(buildApp({ store: failingStore() }), '/api/documents/notes.md')

    given(() => {
      expect(res.status).toBe(500)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })

  it('on a 204 from a trash purge', async () => {
    await store.createDocument('notes.md', 'x')
    const id = await store.trash('notes.md')
    const { res, headersWritten } = await answeredBy(buildApp({ store }), `/api/trash/${id}`, { method: 'DELETE' })

    given(() => {
      expect(res.status).toBe(204)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })
})

describe('static responses carry it too', () => {
  it('on the served page', async () => {
    const { res, headersWritten } = await answeredBy(createApp(configFor(), publicDir), '/doc/')

    given(() => {
      expect(res.status).toBe(200)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })

  it('on a redirect, which builds its own response', async () => {
    const { res, headersWritten } = await answeredBy(createApp(configFor(), publicDir), '/')

    given(() => {
      expect(res.status).toBe(302)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })

  it('on a served asset', async () => {
    const { res, headersWritten } = await answeredBy(createApp(configFor(), publicDir), '/assets/main.js')

    given(() => {
      expect(res.status).toBe(200)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })

  it('on an asset that was never built', async () => {
    const { res, headersWritten } = await answeredBy(createApp(configFor(), publicDir), '/assets/missing.js')

    given(() => {
      expect(res.status).toBe(404)
    })

    expect(headersWritten).toStrictEqual(OVERHEAD)
  })
})
