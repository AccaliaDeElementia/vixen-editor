'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { inspect } from 'node:util'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/server/app.ts'
import { createFsDocumentStore, type DocumentStore } from '../../src/server/storage/fs-store.ts'

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const

const output: string[] = []

let root: string
let store: DocumentStore

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

function failingStore(): DocumentStore {
  return {
    list: () => Promise.reject(new Error('disk on fire')),
    read: () => Promise.reject(new Error('disk on fire')),
    write: () => Promise.reject(new Error('disk on fire')),
    remove: () => Promise.reject(new Error('disk on fire')),
  }
}

describe('the application never writes to the console', () => {
  it('stays silent while serving a document', async () => {
    await store.write('notes.md', '# hello')
    await buildApp({ store }).request('/api/documents/notes.md')

    expect(output).toStrictEqual([])
  })

  it('stays silent on a 404', async () => {
    await buildApp({ store }).request('/api/documents/missing.md')

    expect(output).toStrictEqual([])
  })

  it('stays silent on a rejected document id', async () => {
    await buildApp({ store }).request('/api/documents/evil.txt')

    expect(output).toStrictEqual([])
  })

  it('stays silent on a write and a delete', async () => {
    const app = buildApp({ store })
    await app.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '# hello' }),
    })
    await app.request('/api/documents/notes.md', { method: 'DELETE' })

    expect(output).toStrictEqual([])
  })

  it('stays silent when an unexpected storage fault produces a 500', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/documents/notes.md')

    expect(res.status).toBe(500)
    expect(output).toStrictEqual([])
  })

  it('still reports the fault as a 500 with a json body', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/documents/notes.md')

    await expect(res.json()).resolves.toStrictEqual({ error: 'Internal server error' })
  })

  it('does not leak the underlying error message to the client', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/documents/notes.md')

    await expect(res.text()).resolves.not.toContain('disk on fire')
  })

  it('preserves the status of a deliberate HTTPException instead of flattening it to 500', async () => {
    const res = await buildApp({ store }).request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    })

    expect(res.status).toBe(400)
    expect(output).toStrictEqual([])
  })
})
