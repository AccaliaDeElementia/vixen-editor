'use sanity'

import { once } from 'node:events'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { planArchive } from '../../../src/server/storage/archive.ts'
import { readTree, type FolderEntry, type TreeEntry } from '../../../src/server/storage/tree.ts'

const OVER_NAME_MAX = 'a'.repeat(300)

let root = ''
let outside = ''

async function write(relative: string, content = ''): Promise<void> {
  const target = path.join(root, relative)

  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content)
}

function names(entries: readonly TreeEntry[]): string[] {
  return entries.map((entry) => entry.name)
}

function paths(entries: readonly TreeEntry[]): string[] {
  return entries.flatMap((entry) => [entry.path, ...(entry.kind === 'folder' ? paths(entry.children) : [])])
}

function folder(entries: readonly TreeEntry[], name: string): FolderEntry {
  const found = entries.find((entry) => entry.name === name)
  if (found?.kind !== 'folder') throw new Error(`no folder named ${name}`)
  return found
}

beforeEach(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-tree-'))
  root = path.join(base, 'docs')
  outside = path.join(base, 'outside')
  await fs.mkdir(root, { recursive: true })
  await fs.mkdir(outside, { recursive: true })
})

afterEach(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true })
})

describe('readTree', () => {
  it('returns nothing for an empty root', async () => {
    await expect(readTree(root)).resolves.toStrictEqual([])
  })

  it('returns nothing when the root does not exist', async () => {
    await expect(readTree(path.join(root, 'absent'))).resolves.toStrictEqual([])
  })

  it('surfaces a genuine filesystem fault rather than returning an empty tree', async () => {
    await expect(readTree(path.join(root, OVER_NAME_MAX))).rejects.toThrow(
      expect.objectContaining({ code: 'ENAMETOOLONG' }),
    )
  })

  it('marks documents and images with distinct kinds', async () => {
    await write('notes.md')
    await write('notes.txt')
    await write('photo.png')

    await expect(readTree(root)).resolves.toMatchObject([
      { name: 'notes.md', kind: 'document' },
      { name: 'notes.txt', kind: 'document' },
      { name: 'photo.png', kind: 'image' },
    ])
  })

  it('omits files it cannot classify, because nothing in the app can open them', async () => {
    await write('notes.md')
    await write('archive.zip')
    await write('README')

    await expect(readTree(root).then(names)).resolves.toStrictEqual(['notes.md'])
  })

  it('omits dotfiles and dot-directories, including the trash', async () => {
    await write('notes.md')
    await write('.hidden.md')
    await write('.trash/entry/payload.md')
    await write('.git/config.md')

    await expect(readTree(root).then(names)).resolves.toStrictEqual(['notes.md'])
  })

  it('sorts folders before files, each alphabetically', async () => {
    await write('zebra.md')
    await write('alpha.md')
    await write('work/a.md')
    await write('archive/a.md')

    await expect(readTree(root).then(names)).resolves.toStrictEqual(['archive', 'work', 'alpha.md', 'zebra.md'])
  })

  it('nests children under their folder', async () => {
    await write('journal/2026/september.md')

    const tree = await readTree(root)

    expect(names(folder(folder(tree, 'journal').children, '2026').children)).toStrictEqual(['september.md'])
  })

  it('reports paths relative to the root, with posix separators', async () => {
    await write('journal/2026/september.md')

    await expect(readTree(root).then(paths)).resolves.toStrictEqual([
      'journal',
      'journal/2026',
      'journal/2026/september.md',
    ])
  })

  it('keeps an empty folder, which is how a freshly made one looks before it is seeded', async () => {
    await fs.mkdir(path.join(root, 'empty'), { recursive: true })

    await expect(readTree(root)).resolves.toStrictEqual([
      { name: 'empty', path: 'empty', kind: 'folder', children: [] },
    ])
  })

  it('reports the size of a file in bytes', async () => {
    await write('notes.md', '# hello')

    const [entry] = await readTree(root)

    expect(entry).toMatchObject({ kind: 'document', size: 7 })
  })

  it('reports the modification time as an ISO timestamp', async () => {
    await write('notes.md', 'x')

    const [entry] = await readTree(root)
    const modified = entry?.kind === 'document' ? entry.modified : ''

    expect(Date.parse(modified)).not.toBeNaN()
    expect(modified).toBe(new Date(modified).toISOString())
  })

  it('gives a folder no size, because a directory inode size describes nothing useful', async () => {
    await write('journal/a.md')

    const [entry] = await readTree(root)

    expect(Object.keys(entry ?? {}).sort()).toStrictEqual(['children', 'kind', 'name', 'path'])
  })

  describe('symlinks', () => {
    it('omits a symlink whose target escapes the root', async () => {
      await fs.writeFile(path.join(outside, 'secret.md'), 'classified')
      await fs.symlink(path.join(outside, 'secret.md'), path.join(root, 'innocent.md'))

      await expect(readTree(root).then(names)).resolves.toStrictEqual([])
    })

    it('omits a symlinked directory that escapes the root', async () => {
      await fs.writeFile(path.join(outside, 'secret.md'), 'classified')
      await fs.symlink(outside, path.join(root, 'link'))

      await expect(readTree(root).then(names)).resolves.toStrictEqual([])
    })

    it('keeps a symlink that stays inside the root, matching what the store will read', async () => {
      await write('real.md', 'inside')
      await fs.symlink(path.join(root, 'real.md'), path.join(root, 'alias.md'))

      await expect(readTree(root).then(names)).resolves.toStrictEqual(['alias.md', 'real.md'])
    })

    it('omits a dangling symlink', async () => {
      await fs.symlink(path.join(root, 'never-existed.md'), path.join(root, 'broken.md'))

      await expect(readTree(root).then(names)).resolves.toStrictEqual([])
    })

    it('terminates on a symlink loop rather than walking it forever', async () => {
      await write('journal/a.md')
      await fs.symlink(root, path.join(root, 'journal', 'loop'))

      await expect(readTree(root).then(paths)).resolves.toStrictEqual(['journal', 'journal/a.md'])
    })

    it('follows a symlink to a sibling directory inside the root', async () => {
      await write('source/a.md')
      await fs.symlink(path.join(root, 'source'), path.join(root, 'mirror'))

      await expect(readTree(root).then(paths)).resolves.toStrictEqual([
        'mirror',
        'mirror/a.md',
        'source',
        'source/a.md',
      ])
    })
  })

  it('omits a node that is neither a file nor a directory, however it is named', async () => {
    const socket = net.createServer()
    socket.listen(path.join(root, 'notes.md'))
    await once(socket, 'listening')

    try {
      await expect(readTree(root).then(names)).resolves.toStrictEqual([])
    } finally {
      socket.close()
      await once(socket, 'close')
    }
  })
})

describe('a folder deleted while the walk is in progress', () => {
  function removeAfterStatOf(name: string): void {
    const realStat = fs.stat.bind(fs)

    vi.spyOn(fs, 'stat').mockImplementation(async (...args: Parameters<typeof fs.stat>) => {
      const stats = await realStat(...args)
      const [target] = args
      if (typeof target === 'string' && path.basename(target) === name) {
        await fs.rm(target, { recursive: true, force: true })
      }

      return stats
    })
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('omits it instead of failing the whole listing', async () => {
    await write('keep/a.md')
    await write('vanishes/b.md')
    removeAfterStatOf('vanishes')

    const tree = await readTree(root)

    expect(names(tree)).toStrictEqual(['keep'])
  })

  it('still reports everything the walk did see', async () => {
    await write('keep/a.md')
    await write('vanishes/b.md')
    await write('notes.md')
    removeAfterStatOf('vanishes')

    expect(paths(await readTree(root))).toStrictEqual(['keep', 'keep/a.md', 'notes.md'])
  })

  it('omits it from an archive plan too, which walks the same tree', async () => {
    await write('keep/a.md')
    await write('vanishes/b.md')
    removeAfterStatOf('vanishes')

    const plan = await planArchive(root, '', { maxBytes: 1_000_000, maxEntries: 100 })

    expect(plan.files).toStrictEqual(['keep/a.md'])
  })
})
