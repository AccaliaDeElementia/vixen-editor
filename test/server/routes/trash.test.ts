'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { given } from '../../conditions.ts'
import { fieldOf, refusalOf } from '../refusals.ts'
import { trashRoutes } from '../../../src/server/routes/trash.ts'
import { cast } from '../../cast.ts'
import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'

import { someone } from '../actors.ts'

let root = ''
let store: DocumentStore = createFsDocumentStore('')
let app: Hono = trashRoutes(store)

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-trash-routes-'))
  store = createFsDocumentStore(root)
  app = trashRoutes(store)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('listing the trash', () => {
  it('is empty before anything is deleted', async () => {
    const res = await app.request('/')

    const body: unknown = await res.json()

    expect({ status: res.status, body }).toStrictEqual({ status: 200, body: { entries: [] } })
  })

  it('reports deleted entries in a form that tells them from live files', async () => {
    await store.createDocument('notes.md', 'x', someone)
    await store.trash('notes.md', someone)

    const res = await app.request('/')

    const entries = await fieldOf(res, 'entries')

    expect(entries).toMatchObject([
      { originalPath: 'notes.md', kind: 'document', deletedAt: expect.stringMatching(/^\d{4}-/v) as unknown },
    ])
  })
})

async function restoreRequest(entryId: string, paths: readonly string[]): Promise<Response> {
  return await app.request(`/${entryId}/restores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths }),
  })
}

describe('restoring from an entry', () => {
  async function trashed(): Promise<string> {
    await store.createDocument('notes.md', '# hello', someone)
    return await store.trash('notes.md', someone)
  }

  it('puts the entry back and reports where', async () => {
    const id = await trashed()

    const res = await restoreRequest(id, [''])

    const body: unknown = await res.json()

    expect({ status: res.status, body, restored: await store.read('notes.md') }).toStrictEqual({
      status: 200,
      body: { restored: ['notes.md'], entryRemains: false },
      restored: '# hello',
    })
  })

  it('returns 409 when the original path is occupied, leaving the user to decide', async () => {
    const id = await trashed()
    await store.createDocument('notes.md', 'something else', someone)

    const res = await restoreRequest(id, [''])

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 409, code: 'ALREADY_EXISTS' })
  })

  it('refuses a body that names no paths at all', async () => {
    await store.createDocument('notes.md', '# hello', someone)
    const id = await store.trash('notes.md', someone)

    const res = await app.request(`/${id}/restores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: [] }),
    })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })

  it('returns 404 for an unknown entry', async () => {
    const res = await restoreRequest('00000000-0000-4000-8000-000000000000', [''])

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 404, code: 'NOT_FOUND' })
  })

  it('rejects an entry id that is not a uuid', async () => {
    const res = await restoreRequest('not-a-uuid', [''])

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })
})

describe('purging a single entry', () => {
  it('purges the entry for good', async () => {
    await store.createDocument('notes.md', 'x', someone)
    const id = await store.trash('notes.md', someone)

    const res = await app.request(`/${id}`, { method: 'DELETE' })

    given(() => {
      expect(res.status).toBe(204)
    })

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('refuses a body that names no paths at all', async () => {
    await store.createDocument('notes.md', '# hello', someone)
    const id = await store.trash('notes.md', someone)

    const res = await app.request(`/${id}/restores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: [] }),
    })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })

  it('returns 404 for an unknown entry', async () => {
    const res = await app.request('/00000000-0000-4000-8000-000000000000', { method: 'DELETE' })

    expect(res.status).toBe(404)
  })

  it('rejects an entry id that is not a uuid', async () => {
    const res = await app.request('/not-a-uuid', { method: 'DELETE' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })
})

describe('reading what an entry holds', () => {
  it('answers with what the entry holds', async () => {
    await store.createDocument('journal/a.md', '# a', someone)
    const entryId = await store.trash('journal', someone)

    const res = await app.request(`/${entryId}/entries`)
    const { entry } = cast<{ entry: { name: string; children: Array<{ name: string }> } }>(await res.json())

    expect({ status: res.status, name: entry.name, children: entry.children.map((c) => c.name) }).toStrictEqual({
      status: 200,
      name: 'journal',
      children: ['a.md'],
    })
  })

  it('refuses an id that is not a trash entry id at all', async () => {
    const res = await app.request('/not-a-uuid/entries')

    expect(res.status).toBe(400)
  })

  it('answers 404 for an entry the trash does not hold', async () => {
    const res = await app.request('/0d5caef1-147f-45bf-8546-270886fcaa8f/entries')

    expect(res.status).toBe(404)
  })
})

describe('restoring under a different name', () => {
  it('puts the entry where the request asked', async () => {
    await store.createDocument('notes.md', '# hello', someone)
    const id = await store.trash('notes.md', someone)

    const res = await app.request(`/${id}/restores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: [''], to: 'archive/kept.md' }),
    })

    await expect(res.json()).resolves.toStrictEqual({ restored: ['archive/kept.md'], entryRemains: false })
  })

  it('refuses a new name when more than one thing was named', async () => {
    await store.createDocument('journal/a.md', '# a', someone)
    await store.createDocument('journal/b.md', '# b', someone)
    const id = await store.trash('journal', someone)

    const res = await app.request(`/${id}/restores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: ['a.md', 'b.md'], to: 'journal/one.md' }),
    })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })
})

describe('emptying the trash', () => {
  async function emptied(): Promise<Response> {
    return await app.request('/', { method: 'DELETE' })
  }

  it('answers with how many entries it purged', async () => {
    await store.createDocument('a.md', 'x', someone)
    await store.createDocument('b.md', 'y', someone)
    await store.trash('a.md', someone)
    await store.trash('b.md', someone)

    expect(await fieldOf(await emptied(), 'purged')).toBe(2)
  })

  it('leaves the trash empty', async () => {
    await store.createDocument('a.md', 'x', someone)
    await store.trash('a.md', someone)
    await emptied()

    expect(await store.listTrash()).toStrictEqual([])
  })

  it('answers plainly when the trash was already empty', async () => {
    expect(await fieldOf(await emptied(), 'purged')).toBe(0)
  })

  it('is not reached by a path that names one entry', async () => {
    await store.createDocument('a.md', 'x', someone)
    const entryId = await store.trash('a.md', someone)
    await app.request(`/${entryId}`, { method: 'DELETE' })

    expect(await fieldOf(await emptied(), 'purged')).toBe(0)
  })
})
