'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { givenAsync } from '../../conditions.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TestOnly } from '../../../src/server/storage/atomic-write.ts'
import { sweepTemporaries } from '../../../src/server/storage/sweep.ts'

const { temporaryBeside } = TestOnly

let root = ''

async function write(entryPath: string, content = 'x'): Promise<void> {
  await fs.mkdir(path.join(root, path.dirname(entryPath)), { recursive: true })
  await fs.writeFile(path.join(root, entryPath), content)
}

// The name a real write leaves behind, rather than one hand-written to match
// the pattern the sweep looks for.
function orphanIn(directory: string): string {
  const target = path.join(root, directory, 'note.md')

  return path.relative(root, temporaryBeside(target))
}

async function exists(entryPath: string): Promise<boolean> {
  return await fs
    .stat(path.join(root, entryPath))
    .then(() => true)
    .catch(() => false)
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-sweep-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('sweepTemporaries', () => {
  it('removes an orphan beside a document', async () => {
    const orphan = orphanIn('')
    await write(orphan)

    await givenAsync(expect(sweepTemporaries(root)).resolves.toStrictEqual([orphan]))

    expect(await exists(orphan)).toBe(false)
  })

  it('removes an orphan in a subdirectory', async () => {
    const orphan = orphanIn('journal/2026')
    await write(orphan)

    await expect(sweepTemporaries(root)).resolves.toStrictEqual([orphan])
  })

  it('removes an orphan inside a trash entry', async () => {
    const orphan = orphanIn('.trash/8f14e45f-ea8d-4b9c-a1c2-3d4e5f607182')
    await write(orphan)

    await expect(sweepTemporaries(root)).resolves.toStrictEqual([orphan])
  })

  it('reports every orphan it removed, in a stable order', async () => {
    const first = orphanIn('a')
    const second = orphanIn('b')
    await write(second)
    await write(first)

    const removed = await sweepTemporaries(root)

    expect(removed).toStrictEqual([first, second])
  })

  it('reports them the way a reader counts, so folder9 comes before folder10', async () => {
    const ninth = orphanIn('folder9')
    const tenth = orphanIn('folder10')
    await write(tenth)
    await write(ninth)

    const removed = await sweepTemporaries(root)

    expect(removed).toStrictEqual([ninth, tenth])
  })

  it('reports nothing and removes nothing when the store is clean', async () => {
    await write('notes.md')
    await write('journal/a.md')

    expect({ removed: await sweepTemporaries(root), kept: await exists('notes.md') }).toStrictEqual({
      removed: [],
      kept: true,
    })
  })

  it('returns nothing when the store does not exist yet', async () => {
    await expect(sweepTemporaries(path.join(root, 'absent'))).resolves.toStrictEqual([])
  })

  it('leaves documents and the trash alone', async () => {
    await write('notes.md')
    await write('.trash/8f14e45f-ea8d-4b9c-a1c2-3d4e5f607182/meta.json', '{}')

    await sweepTemporaries(root)

    expect({
      document: await exists('notes.md'),
      trash: await exists('.trash/8f14e45f-ea8d-4b9c-a1c2-3d4e5f607182/meta.json'),
    }).toStrictEqual({ document: true, trash: true })
  })

  it('leaves a dotfile that is not a temporary alone', async () => {
    await write('.gitkeep')

    await givenAsync(expect(sweepTemporaries(root)).resolves.toStrictEqual([]))

    expect(await exists('.gitkeep')).toBe(true)
  })

  it('never removes a directory, even one named like a temporary', async () => {
    const impostor = orphanIn('')
    await fs.mkdir(path.join(root, impostor), { recursive: true })
    await write(`${impostor}/kept.md`)

    await givenAsync(expect(sweepTemporaries(root)).resolves.toStrictEqual([]))

    expect(await exists(`${impostor}/kept.md`)).toBe(true)
  })

  it('removes an orphan inside a directory named like a temporary', async () => {
    const impostor = orphanIn('')
    const orphan = orphanIn(impostor)
    await write(orphan)

    await expect(sweepTemporaries(root)).resolves.toStrictEqual([orphan])
  })

  it('never removes through a symlink', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-outside-'))
    const bait = path.join(outside, 'precious.md')
    await fs.writeFile(bait, 'keep me')
    await fs.symlink(bait, path.join(root, orphanIn('')))

    await givenAsync(expect(sweepTemporaries(root)).resolves.toStrictEqual([]))

    await expect(fs.readFile(bait, 'utf8')).resolves.toBe('keep me')

    await fs.rm(outside, { recursive: true, force: true })
  })

  it('does not descend through a symlinked directory', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-outside-'))
    const bait = path.join(outside, path.basename(orphanIn('')))
    await fs.writeFile(bait, 'x')
    await fs.symlink(outside, path.join(root, 'linked'))

    await givenAsync(expect(sweepTemporaries(root)).resolves.toStrictEqual([]))

    await expect(fs.readFile(bait, 'utf8')).resolves.toBe('x')

    await fs.rm(outside, { recursive: true, force: true })
  })
})
