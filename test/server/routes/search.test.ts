'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { searchRoutes } from '../../../src/server/routes/search.ts'
import type { DocumentStore } from '../../../src/server/storage/fs-store.ts'

import { documentStoreIn } from '../stores.ts'
import { someone } from '../actors.ts'

let root = ''
let store: DocumentStore = documentStoreIn('')
let app: Hono = searchRoutes(store)

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-search-'))
  store = documentStoreIn(root)
  app = searchRoutes(store)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function seed(id: string, content: string): Promise<string> {
  return await store.createDocument(id, content, someone)
}

async function searchFor(query: string): Promise<Response> {
  return await app.request(`/?q=${encodeURIComponent(query)}`)
}

describe('searching the store over the API', () => {
  it('answers with the hits, each naming where it is', async () => {
    await seed('notes.md', 'first line\nthe Alarm rang\n')

    const res = await searchFor('alarm')

    await expect(res.json()).resolves.toStrictEqual({
      hits: [{ path: 'notes.md', line: 2, offset: 'first line\nthe '.length, excerpt: 'the Alarm rang' }],
      capped: false,
    })
  })

  it('answers with nothing found rather than an error, because an empty result is an answer', async () => {
    await seed('notes.md', 'nothing of the sort\n')

    const res = await searchFor('alarm')

    await expect(res.json()).resolves.toStrictEqual({ hits: [], capped: false })
  })

  it('refuses a search for nothing at all', async () => {
    const res = await searchFor('')

    expect(res.status).toBe(400)
  })

  it('refuses a request that asked for no search at all', async () => {
    const res = await app.request('/')

    expect(res.status).toBe(400)
  })

  it('says its answer depends on the language asked for, because the order does', async () => {
    await seed('notes.md', 'alarm\n')

    const res = await searchFor('alarm')

    expect(res.headers.get('vary')).toBe('Accept-Language')
  })
})
