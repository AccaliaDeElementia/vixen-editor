'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { documentIdsUnder } from '../../../src/server/storage/document-ids.ts'
import { serially } from '../../../src/shared/serially.ts'
import { STORE_ROOT } from '../../../src/shared/store-path.ts'

const UNDER_A_PREFIX = 'journal'

let base = ''

async function write(...names: readonly string[]): Promise<void> {
  await serially(names, async (name) => {
    await fs.mkdir(path.dirname(path.join(base, name)), { recursive: true })
    await fs.writeFile(path.join(base, name), 'content')
  })
}

async function idsUnder(prefix = STORE_ROOT): Promise<string[]> {
  return (await documentIdsUnder(base, prefix)).sort()
}

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-ids-'))
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

describe('documentIdsUnder', () => {
  it('finds the documents sitting directly in the directory', async () => {
    await write('notes.md', 'plan.txt')

    expect(await idsUnder()).toStrictEqual(['notes.md', 'plan.txt'])
  })

  it('descends into folders, since a document is addressed by its whole path', async () => {
    await write('journal/2026/entry.md')

    expect(await idsUnder()).toStrictEqual(['journal/2026/entry.md'])
  })

  it('carries the prefix it was given, which is what makes a subtree walk addressable', async () => {
    await write('entry.md')

    expect(await idsUnder(UNDER_A_PREFIX)).toStrictEqual([`${UNDER_A_PREFIX}/entry.md`])
  })

  it('leaves out a file that is not a document, because an image is not editable text', async () => {
    await write('notes.md', 'photo.png')

    expect(await idsUnder()).toStrictEqual(['notes.md'])
  })

  it('leaves out a file with no extension this store recognises', async () => {
    await write('notes.md', 'archive.zip')

    expect(await idsUnder()).toStrictEqual(['notes.md'])
  })

  it('leaves out a dotfile, which the store refuses to list anywhere else either', async () => {
    await write('notes.md', '.hidden.md')

    expect(await idsUnder()).toStrictEqual(['notes.md'])
  })

  it('does not descend into a dot directory, so the trash stays out of the listing', async () => {
    await write('.trash/aaaa/payload.md')

    expect(await idsUnder()).toStrictEqual([])
  })

  it('answers with nothing for a directory that is not there, rather than failing', async () => {
    expect(await documentIdsUnder(path.join(base, 'gone'), STORE_ROOT)).toStrictEqual([])
  })
})
