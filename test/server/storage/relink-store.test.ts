'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { relinkDocument, type PathMove } from '../../../src/server/markdown/relink.ts'
import { createFsDocumentStore } from '../../../src/server/storage/fs-store.ts'
import { moveEntry } from '../../../src/server/storage/move.ts'
import { relinkAfterMove, type RelinkOutcome } from '../../../src/server/storage/relink-store.ts'

let root: string

async function write(id: string, content: string): Promise<void> {
  await fs.mkdir(path.join(root, path.dirname(id)), { recursive: true })
  await fs.writeFile(path.join(root, id), content)
}

async function read(id: string): Promise<string> {
  return await fs.readFile(path.join(root, id), 'utf8')
}

async function documentIds(): Promise<string[]> {
  return await createFsDocumentStore(root).list()
}

// The move itself, then the repair — the order the store does it in, because a
// document has to be read at the path it now occupies.
async function moveThenRelink(from: string, to: string): Promise<RelinkOutcome> {
  const before = await documentIds()
  await fs.mkdir(path.join(root, path.dirname(to)), { recursive: true })
  await moveEntry(root, { from, to })

  const moves: PathMove[] = [{ from, to }]

  return await relinkAfterMove(root, before, moves)
}

async function rewrittenBy(from: string, to: string): Promise<string[]> {
  return (await moveThenRelink(from, to)).rewritten
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-relink-store-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(root, { recursive: true, force: true })
})

describe('relinkAfterMove', () => {
  it('repairs a link to the document that moved', async () => {
    await write('journal/a.md', '# a')
    await write('notes.md', 'see [it](journal/a.md)')

    const rewritten = await rewrittenBy('journal/a.md', 'archive/a.md')

    expect(rewritten).toStrictEqual(['notes.md'])
    await expect(read('notes.md')).resolves.toBe('see [it](archive/a.md)')
  })

  it('repairs a link into a folder that moved', async () => {
    await write('journal/2026/a.md', '# a')
    await write('notes.md', 'see [it](journal/2026/a.md)')

    const rewritten = await rewrittenBy('journal', 'archive')

    expect(rewritten).toStrictEqual(['notes.md'])
    await expect(read('notes.md')).resolves.toBe('see [it](archive/2026/a.md)')
  })

  it('treats a .txt document exactly like markdown', async () => {
    await write('journal/a.md', '# a')
    await write('notes.txt', 'see [it](journal/a.md)')

    const rewritten = await rewrittenBy('journal/a.md', 'archive/a.md')

    expect(rewritten).toStrictEqual(['notes.txt'])
    await expect(read('notes.txt')).resolves.toBe('see [it](archive/a.md)')
  })

  it('reports a document that moved at the path it now has', async () => {
    await write('notes.md', '# notes')
    await write('journal/a.md', 'see [it](../notes.md)')

    const rewritten = await rewrittenBy('journal', 'deep/journal')

    expect(rewritten).toStrictEqual(['deep/journal/a.md'])
    await expect(read('deep/journal/a.md')).resolves.toBe('see [it](../../notes.md)')
  })

  it('reports nothing when no document links to what moved', async () => {
    await write('journal/a.md', '# a')
    await write('notes.md', 'no links here')

    await expect(rewrittenBy('journal/a.md', 'archive/a.md')).resolves.toStrictEqual([])
  })

  it('leaves a document it does not rewrite byte-identical', async () => {
    const untouched = 'no links here\n\n```\n[a](journal/a.md)\n```\n'
    await write('journal/a.md', '# a')
    await write('notes.md', untouched)

    await moveThenRelink('journal/a.md', 'archive/a.md')

    await expect(read('notes.md')).resolves.toBe(untouched)
  })

  it('reports the paths it rewrote in a stable order', async () => {
    await write('journal/a.md', '# a')
    await write('b.md', '[x](journal/a.md)')
    await write('a.md', '[x](journal/a.md)')

    await expect(rewrittenBy('journal/a.md', 'archive/a.md')).resolves.toStrictEqual(['a.md', 'b.md'])
  })
})

// A move has already happened by the time the links are repaired, so one
// unreadable or unwritable document must not strand the rest half-repaired.
// The failures are injected because the real triggers are IO faults, and the
// obvious alternative — an unreadable file — depends on not running as root.
describe('relinkAfterMove when one document cannot be repaired', () => {
  function ioFailure(): Error {
    return Object.assign(new Error('EIO'), { code: 'EIO' })
  }

  function failReadingOf(id: string): void {
    const readFile = fs.readFile.bind(fs)

    vi.spyOn(fs, 'readFile').mockImplementation(async (...args: Parameters<typeof fs.readFile>) => {
      const [target] = args
      if (typeof target === 'string' && target.endsWith(id)) throw ioFailure()

      return await readFile(...args)
    })
  }

  function failWritingOf(id: string): void {
    const rename = fs.rename.bind(fs)

    vi.spyOn(fs, 'rename').mockImplementation(async (...args: Parameters<typeof fs.rename>) => {
      const [, target] = args
      if (typeof target === 'string' && target.endsWith(id)) throw ioFailure()

      await rename(...args)
    })
  }

  async function threeLinkingDocuments(): Promise<void> {
    await write('journal/a.md', '# a')
    await write('one.md', '[x](journal/a.md)')
    await write('two.md', '[x](journal/a.md)')
    await write('three.md', '[x](journal/a.md)')
  }

  it('repairs the others when one cannot be read', async () => {
    await threeLinkingDocuments()
    failReadingOf('two.md')

    const outcome = await moveThenRelink('journal/a.md', 'archive/a.md')

    expect(outcome).toStrictEqual({ rewritten: ['one.md', 'three.md'], failed: ['two.md'] })
    await expect(read('one.md')).resolves.toBe('[x](archive/a.md)')
    await expect(read('three.md')).resolves.toBe('[x](archive/a.md)')
  })

  it('repairs the others when one cannot be written', async () => {
    await threeLinkingDocuments()
    failWritingOf('two.md')

    const outcome = await moveThenRelink('journal/a.md', 'archive/a.md')

    expect(outcome).toStrictEqual({ rewritten: ['one.md', 'three.md'], failed: ['two.md'] })
  })

  it('leaves the document it could not write exactly as it was', async () => {
    await threeLinkingDocuments()
    failWritingOf('two.md')

    await moveThenRelink('journal/a.md', 'archive/a.md')

    vi.restoreAllMocks()
    await expect(read('two.md')).resolves.toBe('[x](journal/a.md)')
  })

  it('reports no failures when every document could be repaired', async () => {
    await threeLinkingDocuments()

    const outcome = await moveThenRelink('journal/a.md', 'archive/a.md')

    expect(outcome).toStrictEqual({ rewritten: ['one.md', 'three.md', 'two.md'], failed: [] })
  })
})

// Parsing is most of what a move costs, so a document with no link syntax is
// skipped without parsing. The filter is only allowed to be faster, never to
// change the answer — so the answer is computed both ways and compared.
describe('skipping documents that cannot hold a link', () => {
  const JOURNAL_TO_ARCHIVE: PathMove[] = [{ from: 'journal', to: 'archive' }]

  const CORPUS: Readonly<Record<string, string>> = {
    'prose.md': '# just prose\n\nnothing to see\n',
    'brackets-but-no-link.md': 'an array [1] and a stray ] plus a colon: here\n',
    'inline.md': 'see [it](journal/a.md)\n',
    'image.md': '![p](journal/p.png)\n',
    'definition.md': '[a][id]\n\n[id]: journal/a.md\n',
    'code-only.md': '```\n[a](journal/a.md)\n```\n',
    'encoded.md': '[a](journal/my%20file.md)\n',
    'bracketed.md': '[a](<journal/my file.md>)\n',
    'unrelated-link.md': '[a](other/b.md)\n',
  }

  it('repairs exactly the documents an unfiltered pass would', async () => {
    await write('journal/a.md', '# a')
    await Promise.all(
      Object.entries(CORPUS).map(async ([id, content]) => {
        await write(id, content)
      }),
    )

    const unfiltered = Object.entries(CORPUS)
      .filter(([id, content]) => relinkDocument(content, id, JOURNAL_TO_ARCHIVE) !== content)
      .map(([id]) => id)
      .sort((a, b) => a.localeCompare(b))

    const outcome = await moveThenRelink('journal', 'archive')

    expect(unfiltered.length).toBeGreaterThan(0)
    expect(outcome.rewritten).toStrictEqual(unfiltered)
  })

  it('still repairs a reference definition, whose syntax is "]:" and not "]("', async () => {
    await write('journal/a.md', '# a')
    await write('notes.md', '[a][id]\n\n[id]: journal/a.md\n')

    await expect(rewrittenBy('journal', 'archive')).resolves.toStrictEqual(['notes.md'])
  })
})
