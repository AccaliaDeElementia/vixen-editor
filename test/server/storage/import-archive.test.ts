'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { importArchive } from '../../../src/server/storage/import-archive.ts'
import { createFsDocumentStore } from '../../../src/server/storage/fs-store.ts'
import { localActor } from '../../../src/server/platform/actor.ts'
import { STORE_ROOT } from '../../../src/shared/store-path.ts'
import { SYMLINK_MODE, zipOf, type FixtureEntry } from './zip-fixtures.ts'

const CONTENT = new TextEncoder().encode('# stored')
const NOTHING_REWRITTEN = (): null => null

let root = ''
let store: ReturnType<typeof createFsDocumentStore> = createFsDocumentStore('', NOTHING_REWRITTEN)

async function archiveOf(entries: readonly FixtureEntry[]): Promise<string> {
  const target = path.join(root, 'in.zip')
  await fs.writeFile(target, zipOf(entries))

  return target
}

async function importing(entries: readonly FixtureEntry[], into = STORE_ROOT): ReturnType<typeof importArchive> {
  return await importArchive({ store, archivePath: await archiveOf(entries), format: 'zip', into, actor: localActor() })
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-import-'))
  await fs.mkdir(path.join(root, 'docs'), { recursive: true })
  store = createFsDocumentStore(path.join(root, 'docs'), NOTHING_REWRITTEN)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('an archive the store can take whole', () => {
  it('reports what it placed', async () => {
    const outcome = await importing([{ name: 'journal/a.md', bytes: CONTENT }])

    expect(outcome).toStrictEqual({ kind: 'imported', paths: ['journal/a.md'] })
  })

  it('places the contents, not just the name', async () => {
    await importing([{ name: 'journal/a.md', bytes: CONTENT }])

    await expect(store.read('journal/a.md')).resolves.toBe('# stored')
  })

  it('lands at the store root when no directory was given, rather than under a dot', async () => {
    const outcome = await importing([{ name: 'a.md', bytes: CONTENT }])

    expect(outcome).toStrictEqual({ kind: 'imported', paths: ['a.md'] })
  })

  it('lands under the directory it was given', async () => {
    const outcome = await importing([{ name: 'a.md', bytes: CONTENT }], 'journal')

    expect(outcome).toStrictEqual({ kind: 'imported', paths: ['journal/a.md'] })
  })

  it('passes over a directory entry, because a folder exists only where a document does', async () => {
    const outcome = await importing([{ name: 'journal/' }, { name: 'journal/a.md', bytes: CONTENT }])

    expect(outcome).toStrictEqual({ kind: 'imported', paths: ['journal/a.md'] })
  })
})

describe('an archive carrying an entry the store will not take', () => {
  it('is refused whole, so a half import cannot happen', async () => {
    const outcome = await importing([
      { name: 'journal/a.md', bytes: CONTENT },
      { name: 'journal/link', mode: SYMLINK_MODE },
    ])

    expect(outcome.kind).toBe('refused')
  })

  it('places nothing from it, not even the entries it would have taken', async () => {
    await importing([
      { name: 'journal/a.md', bytes: CONTENT },
      { name: 'journal/link', mode: SYMLINK_MODE },
    ])

    await expect(store.read('journal/a.md')).rejects.toThrow()
  })

  it('says which entry and why, so the reader can fix the archive', async () => {
    const outcome = await importing([{ name: '../../../etc/evil.md', bytes: CONTENT }])

    expect(outcome).toStrictEqual({
      kind: 'refused',
      reasons: ['../../../etc/evil.md is not a name the store accepts'],
    })
  })
})

describe('an archive with nothing in it to take', () => {
  it('is refused, because a no-op success reads as a bug', async () => {
    expect((await importing([{ name: 'journal/' }])).kind).toBe('refused')
  })
})

describe('an archive that would land on something already there', () => {
  it('is refused, naming what it would have replaced', async () => {
    await store.createDocument('journal/a.md', '# already here', localActor())

    expect(await importing([{ name: 'journal/a.md', bytes: CONTENT }])).toStrictEqual({
      kind: 'collides',
      paths: ['journal/a.md'],
    })
  })

  it('leaves what was there untouched', async () => {
    await store.createDocument('journal/a.md', '# already here', localActor())

    await importing([{ name: 'journal/a.md', bytes: CONTENT }])

    await expect(store.read('journal/a.md')).resolves.toBe('# already here')
  })
})
