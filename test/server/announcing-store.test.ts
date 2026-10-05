'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/server/app.ts'
import { createChanges, type StoreChange } from '../../src/server/changes.ts'
import { createFsDocumentStore, type DocumentStore } from '../../src/server/storage/fs-store.ts'
import { fieldOf } from './routes/refusals.ts'

let root = ''
let store: DocumentStore = createFsDocumentStore('')
let app: Hono = buildApp({ store })
let heard: StoreChange[] = []

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-announce-'))
  store = createFsDocumentStore(root)
  const changes = createChanges()
  heard = []
  changes.listen((change) => {
    heard.push(change)
  })
  app = buildApp({ store, changes })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function send(url: string, init: RequestInit): Promise<Response> {
  return await app.request(url, init)
}

const JSON_POST = { method: 'POST', headers: { 'content-type': 'application/json' } }

describe('what the store announces', () => {
  it('says a new document was written', async () => {
    await send('/api/files/documents', { ...JSON_POST, body: JSON.stringify({ path: 'a.md', content: '# a' }) })

    expect(heard).toStrictEqual([{ path: 'a.md', kind: 'written' }])
  })

  it('says a new folder was written', async () => {
    await send('/api/files/folders', { ...JSON_POST, body: JSON.stringify({ path: 'journal' }) })

    expect(heard).toStrictEqual([{ path: 'journal', kind: 'written' }])
  })

  it('says a saved document was written', async () => {
    const etag = await store.createDocument('a.md', '# a')
    heard = []

    await send('/api/documents/a.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': etag },
      body: JSON.stringify({ content: '# edited' }),
    })

    expect(heard).toStrictEqual([{ path: 'a.md', kind: 'written' }])
  })

  it('says a move is one event, so the two ends cannot be mistaken for unrelated edits', async () => {
    await store.createDocument('a.md', '# a')
    heard = []

    await send('/api/files/moves', { ...JSON_POST, body: JSON.stringify({ from: 'a.md', to: 'b.md' }) })

    expect(heard).toStrictEqual([{ kind: 'moved', from: 'a.md', to: 'b.md' }])
  })

  it('writes a document a move rewrote, so listening for writes alone is not wrong', async () => {
    await store.createDocument('linker.md', '[to a](a.md)\n')
    await store.createDocument('a.md', '# a')
    heard = []

    await send('/api/files/moves', { ...JSON_POST, body: JSON.stringify({ from: 'a.md', to: 'b.md' }) })

    expect(heard).toStrictEqual([
      { kind: 'moved', from: 'a.md', to: 'b.md' },
      { path: 'linker.md', kind: 'written' },
    ])
  })

  it('says a trashed entry was removed', async () => {
    await store.createDocument('a.md', '# a')
    heard = []

    await send('/api/files/entries/a.md', { method: 'DELETE' })

    expect(heard).toStrictEqual([{ path: 'a.md', kind: 'removed' }])
  })

  it('says where a restored entry came back to', async () => {
    await store.createDocument('a.md', '# a')
    const trashId = await fieldOf(await send('/api/files/entries/a.md', { method: 'DELETE' }), 'trashId')
    heard = []

    await send(`/api/trash/${String(trashId)}/restores`, { ...JSON_POST, body: JSON.stringify({ paths: [''] }) })

    expect(heard).toStrictEqual([{ path: 'a.md', kind: 'written' }])
  })

  it('says the store changed when the trash is emptied, since the listing did', async () => {
    await store.createDocument('a.md', '# a')
    await send('/api/files/entries/a.md', { method: 'DELETE' })
    heard = []

    await send('/api/trash', { method: 'DELETE' })

    expect(heard).toStrictEqual([{ path: '', kind: 'removed' }])
  })

  it('says nothing when the write was refused', async () => {
    await store.createDocument('a.md', '# a')
    heard = []

    await send('/api/files/documents', { ...JSON_POST, body: JSON.stringify({ path: 'a.md', content: '# again' }) })

    expect(heard).toStrictEqual([])
  })
})
