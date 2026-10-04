'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'
import { restoreSelection } from '../../../src/server/storage/trash-restore.ts'
import { BlockedRestoreError, DocumentNotFoundError } from '../../../src/server/storage/store-errors.ts'
import { InvalidPathError } from '../../../src/server/storage/safe-path.ts'
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

describe('restoring one thing under a different name', () => {
  it('puts it where it was told to go', async () => {
    const entryId = await trashedJournal()

    await restoreSelection(root, { entryId, paths: ['a.md'], to: 'journal/renamed.md' })

    expect(await exists('journal/renamed.md')).toBe(true)
  })

  it('reports the path it actually went to', async () => {
    const entryId = await trashedJournal()

    const outcome = await restoreSelection(root, { entryId, paths: ['a.md'], to: 'elsewhere/kept.md' })

    expect(outcome.restored).toStrictEqual(['elsewhere/kept.md'])
  })

  it('may send it to a different folder entirely', async () => {
    const entryId = await trashedJournal()

    await restoreSelection(root, { entryId, paths: ['a.md'], to: 'elsewhere/kept.md' })

    expect(await exists('elsewhere/kept.md')).toBe(true)
  })

  it('rescues a name the validator would otherwise refuse', async () => {
    const entryId = await trashedJournal()
    await fs.writeFile(path.join(root, '.trash', entryId, 'payload', ' leading.md'), '# odd')

    await restoreSelection(root, { entryId, paths: [' leading.md'], to: 'journal/fixed.md' })

    expect(await exists('journal/fixed.md')).toBe(true)
  })

  it('refuses to change what the file claims to be', async () => {
    const entryId = await trashedJournal()

    await expect(restoreSelection(root, { entryId, paths: ['a.md'], to: 'journal/a.png' })).rejects.toThrow(
      InvalidPathError,
    )
  })

  it('refuses a destination that is already taken', async () => {
    const entryId = await trashedJournal()
    await write('taken.md', '# live')

    await expect(restoreSelection(root, { entryId, paths: ['a.md'], to: 'taken.md' })).rejects.toThrow(
      BlockedRestoreError,
    )
  })

  it('keeps the names inside a renamed folder', async () => {
    const entryId = await trashedJournal()

    await restoreSelection(root, { entryId, paths: ['2026'], to: 'journal/renamed' })

    expect(await exists('journal/renamed/march.md')).toBe(true)
  })
})

describe('links inside something restored under a new name', () => {
  async function trashedWithLink(): Promise<string> {
    await write('journal/notes.md', '# notes\n\n[the other](./other.md) and [up](../top.md)\n')
    await write('journal/other.md', '# other')
    await write('top.md', '# top')
    await write('elsewhere/pointer.md', '# pointer\n\n[at notes](../journal/notes.md)\n')

    return await store.trash('journal/notes.md')
  }

  it('are re-based so they still reach what they named', async () => {
    const entryId = await trashedWithLink()

    await restoreSelection(root, { entryId, paths: [''], to: 'deep/down/notes.md' })

    await expect(store.read('deep/down/notes.md')).resolves.toContain('../../journal/other.md')
  })

  it('reach a file outside the folder just the same', async () => {
    const entryId = await trashedWithLink()

    await restoreSelection(root, { entryId, paths: [''], to: 'deep/down/notes.md' })

    await expect(store.read('deep/down/notes.md')).resolves.toContain('../../top.md')
  })

  it('leave the rest of the store alone, since those links were already dead', async () => {
    const entryId = await trashedWithLink()

    await restoreSelection(root, { entryId, paths: [''], to: 'deep/down/notes.md' })

    await expect(store.read('elsewhere/pointer.md')).resolves.toContain('../journal/notes.md')
  })

  it('are left exactly as written when it goes back where it came from', async () => {
    const entryId = await trashedWithLink()

    await restoreSelection(root, { entryId, paths: [''] })

    await expect(store.read('journal/notes.md')).resolves.toContain('./other.md')
  })
})

describe('an image restored under a different name', () => {
  it('goes where it was asked, with nothing to relink inside it', async () => {
    await write('pictures/shot.png', 'not really a png')
    const entryId = await store.trash('pictures/shot.png')

    await restoreSelection(root, { entryId, paths: [''], to: 'pictures/renamed.png' })

    expect(await exists('pictures/renamed.png')).toBe(true)
  })
})

describe('a path that tries to climb out of the payload', () => {
  async function climbing(within: string): Promise<unknown> {
    const entryId = await trashedJournal()
    await write('secret.md', '# secret')

    return await restoreSelection(root, { entryId, paths: [within] }).catch((error: unknown) => error)
  }

  it('is refused rather than reaching a sibling of the store root', async () => {
    expect(await climbing('../../secret.md')).toBeInstanceOf(InvalidPathError)
  })

  it('is refused rather than naming the trash itself', async () => {
    expect(await climbing('..')).toBeInstanceOf(InvalidPathError)
  })

  it('leaves what it tried to reach exactly where it was', async () => {
    await climbing('../../secret.md')

    expect(await exists('secret.md')).toBe(true)
  })
})
