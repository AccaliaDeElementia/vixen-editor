'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { given } from '../conditions.ts'
import { inspect } from 'node:util'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/server/app.ts'
import { createFsDocumentStore, type StoreLayer } from '../../src/server/storage/fs-store.ts'
import { failingStore } from '../server/failing-store.ts'
import { forgetfulActors } from '../server/stores.ts'

import { someone } from '../server/actors.ts'

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const

const output: string[] = []

let root = ''
let store: StoreLayer = createFsDocumentStore('')

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-silence-'))
  store = createFsDocumentStore(root)
  output.length = 0

  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]): void => {
      output.push(`console.${method}(${args.map((value) => inspect(value)).join(', ')})`)
    })
  }
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(root, { recursive: true, force: true })
})

describe('the application never writes to the console', () => {
  it('stays silent while serving a document', async () => {
    await store.createDocument('notes.md', '# hello', someone)
    await buildApp({ store, actors: forgetfulActors }).request('/api/documents/notes.md')

    expect(output).toStrictEqual([])
  })

  it('stays silent on a 404', async () => {
    await buildApp({ store, actors: forgetfulActors }).request('/api/documents/missing.md')

    expect(output).toStrictEqual([])
  })

  it('stays silent on a rejected document id', async () => {
    await buildApp({ store, actors: forgetfulActors }).request('/api/documents/evil.txt')

    expect(output).toStrictEqual([])
  })

  it('stays silent on a write and a delete', async () => {
    const app = buildApp({ store, actors: forgetfulActors })
    await app.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '# hello' }),
    })
    await app.request('/api/documents/notes.md', { method: 'DELETE' })

    expect(output).toStrictEqual([])
  })

  it('stays silent when an unexpected storage fault produces a 500', async () => {
    const res = await buildApp({ store: failingStore(), actors: forgetfulActors }).request('/api/documents/notes.md')

    given(() => {
      expect(res.status).toBe(500)
    })

    expect(output).toStrictEqual([])
  })

  it('stays silent on a deliberate HTTPException, which takes a different path out', async () => {
    const res = await buildApp({ store, actors: forgetfulActors }).request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    })

    given(() => {
      expect(res.status).toBe(400)
    })

    expect(output).toStrictEqual([])
  })
})
