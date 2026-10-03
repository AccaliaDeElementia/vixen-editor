'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'
import { restoreSelection } from '../../../src/server/storage/trash-restore.ts'
import { BlockedRestoreError, DocumentNotFoundError } from '../../../src/server/storage/store-errors.ts'
import { givenAsync } from '../../conditions.ts'

let root = ''
let store: DocumentStore = createFsDocumentStore('')

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-restore-'))
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

async function exists(relative: string): Promise<boolean> {
  return await fs
    .stat(path.join(root, relative))
    .then(() => true)
    .catch(() => false)
}

async function trashedJournal(): Promise<string> {
  await write('journal/a.md')
  await write('journal/b.md')
  await write('journal/2026/march.md')

  return await store.trash('journal')
}

describe('restoring the whole entry', () => {
  it('puts it back where it came from', async () => {
    const entryId = await trashedJournal()

    await restoreSelection(root, { entryId, paths: [''] })

    expect(await exists('journal/2026/march.md')).toBe(true)
  })

  it('reports the path it went back to', async () => {
    const entryId = await trashedJournal()

    const outcome = await restoreSelection(root, { entryId, paths: [''] })

    expect(outcome.restored).toStrictEqual(['journal'])
  })

  it('leaves no entry behind, since nothing of it remains', async () => {
    const entryId = await trashedJournal()

    const outcome = await restoreSelection(root, { entryId, paths: [''] })

    expect(outcome.entryRemains).toBe(false)
  })
})

describe('restoring part of an entry', () => {
  it('puts back only what was asked for', async () => {
    const entryId = await trashedJournal()

    await restoreSelection(root, { entryId, paths: ['a.md'] })

    expect({ a: await exists('journal/a.md'), b: await exists('journal/b.md') }).toStrictEqual({ a: true, b: false })
  })

  it('recreates the folder it used to live in', async () => {
    const entryId = await trashedJournal()

    await restoreSelection(root, { entryId, paths: ['2026/march.md'] })

    expect(await exists('journal/2026/march.md')).toBe(true)
  })

  it('leaves the entry holding what was not asked for', async () => {
    const entryId = await trashedJournal()

    const outcome = await restoreSelection(root, { entryId, paths: ['a.md'] })

    expect(outcome.entryRemains).toBe(true)
  })

  it('takes several at once', async () => {
    const entryId = await trashedJournal()

    const outcome = await restoreSelection(root, { entryId, paths: ['a.md', 'b.md'] })

    expect(outcome.restored).toStrictEqual(['journal/a.md', 'journal/b.md'])
  })

  it('drops the entry once the last of it has gone', async () => {
    const entryId = await trashedJournal()

    const outcome = await restoreSelection(root, { entryId, paths: ['a.md', 'b.md', '2026'] })

    expect(outcome.entryRemains).toBe(false)
  })
})

describe('what the trash holds afterwards', () => {
  it('no longer lists the entry once the last of it has been taken back', async () => {
    const entryId = await trashedJournal()

    await restoreSelection(root, { entryId, paths: ['a.md', 'b.md', '2026'] })

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('still lists it while it holds something', async () => {
    const entryId = await trashedJournal()

    await restoreSelection(root, { entryId, paths: ['a.md'] })

    await expect(store.listTrash()).resolves.toHaveLength(1)
  })
})

describe('a selection that names a folder and something inside it', () => {
  it('restores it once, rather than failing on the second', async () => {
    const entryId = await trashedJournal()

    const outcome = await restoreSelection(root, { entryId, paths: ['2026', '2026/march.md'] })

    expect(outcome.restored).toStrictEqual(['journal/2026'])
  })

  it('still brings the contents back with it', async () => {
    const entryId = await trashedJournal()

    await restoreSelection(root, { entryId, paths: ['2026', '2026/march.md'] })

    expect(await exists('journal/2026/march.md')).toBe(true)
  })

  it('treats the whole entry as covering everything else named', async () => {
    const entryId = await trashedJournal()

    const outcome = await restoreSelection(root, { entryId, paths: ['a.md', ''] })

    expect(outcome.restored).toStrictEqual(['journal'])
  })
})

describe('a destination that is not free', () => {
  it('refuses rather than overwriting', async () => {
    const entryId = await trashedJournal()
    await write('journal/a.md', '# live')

    await expect(restoreSelection(root, { entryId, paths: ['a.md'] })).rejects.toThrow(BlockedRestoreError)
  })

  it('names every path in the way, so the user can clear them', async () => {
    const entryId = await trashedJournal()
    await write('journal/a.md', '# live')
    await write('journal/b.md', '# live')

    await expect(restoreSelection(root, { entryId, paths: ['a.md', 'b.md'] })).rejects.toMatchObject({
      paths: ['journal/a.md', 'journal/b.md'],
    })
  })

  it('moves nothing at all when one of them is blocked', async () => {
    const entryId = await trashedJournal()
    await write('journal/b.md', '# live')

    await givenAsync(expect(restoreSelection(root, { entryId, paths: ['a.md', 'b.md'] })).rejects.toThrow())

    expect(await exists('journal/a.md')).toBe(false)
  })

  it('refuses when a live file sits where a folder would have to be made', async () => {
    const entryId = await trashedJournal()
    await write('journal', '# a file now')

    await expect(restoreSelection(root, { entryId, paths: ['a.md'] })).rejects.toThrow(BlockedRestoreError)
  })
})

describe('a selection that names something the entry does not hold', () => {
  it('refuses rather than restoring the rest', async () => {
    const entryId = await trashedJournal()

    await expect(restoreSelection(root, { entryId, paths: ['a.md', 'nowhere.md'] })).rejects.toThrow(
      DocumentNotFoundError,
    )
  })

  it('moves nothing when it does', async () => {
    const entryId = await trashedJournal()

    await givenAsync(expect(restoreSelection(root, { entryId, paths: ['a.md', 'nowhere.md'] })).rejects.toThrow())

    expect(await exists('journal/a.md')).toBe(false)
  })

  it('refuses an entry that is not in the trash at all', async () => {
    await expect(
      restoreSelection(root, { entryId: '0d5caef1-147f-45bf-8546-270886fcaa8f', paths: [''] }),
    ).rejects.toThrow(DocumentNotFoundError)
  })
})

describe('a name the validator would no longer allow', () => {
  it('is refused rather than placed', async () => {
    const entryId = await trashedJournal()
    await fs.writeFile(path.join(root, '.trash', entryId, 'payload', ' leading.md'), '# odd')

    await expect(restoreSelection(root, { entryId, paths: [' leading.md'] })).rejects.toThrow()
  })

  it('leaves the rest of the entry alone when it is refused', async () => {
    const entryId = await trashedJournal()
    await fs.writeFile(path.join(root, '.trash', entryId, 'payload', ' leading.md'), '# odd')

    await givenAsync(expect(restoreSelection(root, { entryId, paths: ['a.md', ' leading.md'] })).rejects.toThrow())

    expect(await exists('journal/a.md')).toBe(false)
  })
})

describe('a move that fails part way through', () => {
  const SECOND_MOVE = 2

  function failRenameNumber(which: number): void {
    const rename = fs.rename.bind(fs)
    let moves = 0

    vi.spyOn(fs, 'rename').mockImplementation(async (...args: Parameters<typeof fs.rename>) => {
      moves += 1
      if (moves === which) throw Object.assign(new Error('EIO'), { code: 'EIO' })

      await rename(...args)
    })
  }

  function failTheSecondRename(): void {
    failRenameNumber(SECOND_MOVE)
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports the failure rather than claiming success', async () => {
    const entryId = await trashedJournal()
    failTheSecondRename()

    await expect(restoreSelection(root, { entryId, paths: ['a.md', 'b.md'] })).rejects.toThrow('EIO')
  })

  it('puts back what it had already moved, so the store is as it was', async () => {
    const entryId = await trashedJournal()
    failTheSecondRename()

    await givenAsync(expect(restoreSelection(root, { entryId, paths: ['a.md', 'b.md'] })).rejects.toThrow())

    expect(await exists('journal/a.md')).toBe(false)
  })

  it('leaves the entry holding everything it started with', async () => {
    const entryId = await trashedJournal()
    failTheSecondRename()

    await givenAsync(expect(restoreSelection(root, { entryId, paths: ['a.md', 'b.md'] })).rejects.toThrow())

    expect(await exists(`.trash/${entryId}/payload/a.md`)).toBe(true)
  })

  it('carries on unwinding when a folder it made will not come away', async () => {
    const entryId = await trashedJournal()
    failTheSecondRename()
    vi.spyOn(fs, 'rmdir').mockRejectedValue(Object.assign(new Error('ENOTEMPTY'), { code: 'ENOTEMPTY' }))

    await givenAsync(expect(restoreSelection(root, { entryId, paths: ['a.md', 'b.md'] })).rejects.toThrow())

    expect(await exists(`.trash/${entryId}/payload/a.md`)).toBe(true)
  })

  it('takes away a folder it had to make, rather than leaving an empty one', async () => {
    const entryId = await trashedJournal()
    failTheSecondRename()

    await givenAsync(expect(restoreSelection(root, { entryId, paths: ['2026/march.md', 'a.md'] })).rejects.toThrow())

    expect(await exists('journal')).toBe(false)
  })
})

describe('unwinding a move that needed no new folder', () => {
  const THIRD_MOVE = 3

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('puts that one back as well, since the folder was already there by then', async () => {
    const entryId = await trashedJournal()
    const rename = fs.rename.bind(fs)
    let moves = 0
    vi.spyOn(fs, 'rename').mockImplementation(async (...args: Parameters<typeof fs.rename>) => {
      moves += 1
      if (moves === THIRD_MOVE) throw Object.assign(new Error('EIO'), { code: 'EIO' })

      await rename(...args)
    })

    await givenAsync(expect(restoreSelection(root, { entryId, paths: ['a.md', 'b.md', '2026'] })).rejects.toThrow())

    expect(await exists('journal/b.md')).toBe(false)
  })
})
