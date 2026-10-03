'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'
import { readTrashEntry, type TrashEntryNode } from '../../../src/server/storage/trash-entries.ts'
import { DocumentNotFoundError } from '../../../src/server/storage/store-errors.ts'
import { given, givenAsync } from '../../conditions.ts'

let root = ''
let store: DocumentStore = createFsDocumentStore('')

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-payload-'))
  store = createFsDocumentStore(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function write(relative: string, content = '# x'): Promise<void> {
  const target = path.join(root, relative)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content)
}

function childNamed(node: TrashEntryNode, name: string): TrashEntryNode {
  const found = node.kind === 'folder' ? node.children.find((child) => child.name === name) : undefined
  if (found === undefined) throw new Error(`no child named ${name}`)

  return found
}

function namesIn(node: TrashEntryNode): string[] {
  return node.kind === 'folder' ? node.children.map((child) => child.name) : []
}

describe('reading what a trashed entry holds', () => {
  it('answers a trashed file with the one item it is', async () => {
    await write('notes.md')
    const entryId = await store.trash('notes.md')

    const entry = await readTrashEntry(root, entryId)

    expect(entry).toMatchObject({ name: 'notes.md', path: '', kind: 'document' })
  })

  it('answers a trashed folder with what was inside it', async () => {
    await write('journal/a.md')
    await write('journal/b.md')
    const entryId = await store.trash('journal')

    const entry = await readTrashEntry(root, entryId)

    expect(namesIn(entry)).toStrictEqual(['a.md', 'b.md'])
  })

  it('names each item by where it sits inside the entry', async () => {
    await write('journal/2026/march.md')
    const entryId = await store.trash('journal')

    const entry = await readTrashEntry(root, entryId)

    expect(childNamed(childNamed(entry, '2026'), 'march.md').path).toBe('2026/march.md')
  })

  it('puts folders ahead of files, as the live tree does', async () => {
    await write('journal/a.md')
    await write('journal/zzz/deep.md')
    const entryId = await store.trash('journal')

    const entry = await readTrashEntry(root, entryId)

    expect(namesIn(entry)).toStrictEqual(['zzz', 'a.md'])
  })

  it('refuses an entry that is not there', async () => {
    await expect(readTrashEntry(root, '0d5caef1-147f-45bf-8546-270886fcaa8f')).rejects.toThrow(DocumentNotFoundError)
  })
})

describe('whether an item could be put back', () => {
  it('says so for an ordinary name', async () => {
    await write('journal/a.md')
    const entryId = await store.trash('journal')

    const entry = await readTrashEntry(root, entryId)

    expect(childNamed(entry, 'a.md').restorable).toBe(true)
  })

  it('refuses a name the validator would no longer allow', async () => {
    await write('journal/a.md')
    const entryId = await store.trash('journal')
    await fs.writeFile(path.join(root, '.trash', entryId, 'payload', ' leading.md'), '# odd')

    const entry = await readTrashEntry(root, entryId)

    expect(childNamed(entry, ' leading.md').restorable).toBe(false)
  })

  it('lists that name anyway, rather than hiding something it cannot place', async () => {
    await write('journal/a.md')
    const entryId = await store.trash('journal')
    await fs.writeFile(path.join(root, '.trash', entryId, 'payload', ' leading.md'), '# odd')

    const entry = await readTrashEntry(root, entryId)

    expect(namesIn(entry)).toContain(' leading.md')
  })

  it('carries the refusal down, since a child cannot be placed under a name that cannot', async () => {
    await write('journal/a.md')
    const entryId = await store.trash('journal')
    const odd = path.join(root, '.trash', entryId, 'payload', ' odd')
    await fs.mkdir(odd)
    await fs.writeFile(path.join(odd, 'fine.md'), '# fine')

    const entry = await readTrashEntry(root, entryId)

    expect(childNamed(childNamed(entry, ' odd'), 'fine.md').restorable).toBe(false)
  })
})

describe('whether the live store is in the way', () => {
  it('says nothing is blocking when the path is free', async () => {
    await write('journal/a.md')
    const entryId = await store.trash('journal')

    const entry = await readTrashEntry(root, entryId)

    expect(entry.blockedBy).toBeNull()
  })

  it('names the live path that took the entry back', async () => {
    await write('journal/a.md')
    const entryId = await store.trash('journal')
    await write('journal/other.md')

    const entry = await readTrashEntry(root, entryId)

    expect(entry.blockedBy).toBe('journal')
  })

  it('names it for an item inside the entry too', async () => {
    await write('journal/a.md')
    const entryId = await store.trash('journal')
    await write('journal/a.md', '# back')

    const entry = await readTrashEntry(root, entryId)

    expect(childNamed(entry, 'a.md').blockedBy).toBe('journal/a.md')
  })
})

describe('a symlink inside a trashed folder', () => {
  it('is left out when it points outside the store', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-outside-'))
    await fs.writeFile(path.join(outside, 'secret.md'), '# secret')
    await write('journal/a.md')
    const entryId = await store.trash('journal')
    await fs.symlink(path.join(outside, 'secret.md'), path.join(root, '.trash', entryId, 'payload', 'secret.md'))

    const entry = await readTrashEntry(root, entryId)

    await givenAsync(fs.rm(outside, { recursive: true, force: true }))
    expect(namesIn(entry)).toStrictEqual(['a.md'])
  })

  it('is listed as a leaf when it points inside the store, since restoring moves the link', async () => {
    await write('journal/a.md')
    await write('target.md')
    const entryId = await store.trash('journal')
    await fs.symlink(path.join(root, 'target.md'), path.join(root, '.trash', entryId, 'payload', 'link.md'))

    const entry = await readTrashEntry(root, entryId)

    given(() => {
      expect(namesIn(entry)).toContain('link.md')
    })
    expect(childNamed(entry, 'link.md').kind).toBe('document')
  })
})

describe('a payload that is not quite what it should be', () => {
  it('leaves out a file that is neither a document nor an image', async () => {
    await write('journal/a.md')
    const entryId = await store.trash('journal')
    await fs.writeFile(path.join(root, '.trash', entryId, 'payload', 'notes.xyz'), 'x')

    const entry = await readTrashEntry(root, entryId)

    expect(namesIn(entry)).toStrictEqual(['a.md'])
  })

  it('answers an empty folder when the payload has gone, rather than failing the listing', async () => {
    await write('journal/a.md')
    const entryId = await store.trash('journal')
    await fs.rm(path.join(root, '.trash', entryId, 'payload'), { recursive: true })

    const entry = await readTrashEntry(root, entryId)

    expect(namesIn(entry)).toStrictEqual([])
  })
})
