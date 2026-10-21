'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { eachTarFile, readTarEntries } from '../../../src/server/storage/tar-entries.ts'
import { tarGzOf, type TarFixtureEntry } from './tar-fixtures.ts'

const CONTENT = new TextEncoder().encode('# stored')

let root = ''

async function archiveOf(entries: readonly TarFixtureEntry[]): Promise<string> {
  const target = path.join(root, 'in.tar.gz')
  await fs.writeFile(target, await tarGzOf(entries))

  return target
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-tar-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('reading what a tar declares', () => {
  it('names every entry it holds', async () => {
    const found = await readTarEntries(await archiveOf([{ name: 'journal/a.md', bytes: CONTENT }]))

    expect(found.map((entry) => entry.name)).toStrictEqual(['journal/a.md'])
  })

  it('reports the size the archive claims, which is a claim rather than a fact', async () => {
    const found = await readTarEntries(await archiveOf([{ name: 'a.md', bytes: CONTENT }]))

    expect(found.at(0)?.declaredBytes).toBe(CONTENT.length)
  })

  it('reads a regular file as one', async () => {
    const found = await readTarEntries(await archiveOf([{ name: 'a.md', bytes: CONTENT }]))

    expect(found.at(0)?.kind).toBe('file')
  })

  it('carries no encryption, because a tar has no such thing to declare', async () => {
    const found = await readTarEntries(await archiveOf([{ name: 'a.md', bytes: CONTENT }]))

    expect(found.at(0)?.encrypted).toBe(false)
  })
})

describe('a tar entry that is not a regular file', () => {
  it.each([
    ['symlink', 'a link out of the store'],
    ['link', 'a hard link'],
    ['fifo', 'a pipe'],
    ['character-device', 'a device'],
  ] as const)('reads %s as something else, because it is %s', async (type, _why) => {
    const found = await readTarEntries(await archiveOf([{ name: 'odd', type, linkname: '/etc/passwd' }]))

    expect(found.at(0)?.kind).toBe('other')
  })

  it('reads a directory as one, so it can be passed over rather than refused', async () => {
    const found = await readTarEntries(await archiveOf([{ name: 'journal/', type: 'directory' }]))

    expect(found.at(0)?.kind).toBe('directory')
  })
})

describe('a name the tar chose', () => {
  it('is handed over exactly as declared, never repaired', async () => {
    const found = await readTarEntries(await archiveOf([{ name: '../../../etc/evil.md', bytes: CONTENT }]))

    expect(found.at(0)?.name).toBe('../../../etc/evil.md')
  })

  it('arrives whole when it is longer than a tar header can hold', async () => {
    const long = `journal/${'n'.repeat(140)}.md`
    const found = await readTarEntries(await archiveOf([{ name: long, bytes: CONTENT }]))

    expect(found.at(0)?.name).toBe(long)
  })
})

describe('taking the contents of the tar entries it was asked for', () => {
  it('hands over what an entry holds', async () => {
    const archive = await archiveOf([{ name: 'a.md', bytes: CONTENT }])
    const taken = new Map<string, string>()

    await eachTarFile(archive, new Set(['a.md']), (name, bytes) => {
      taken.set(name, new TextDecoder().decode(bytes))
    })

    expect(taken.get('a.md')).toBe('# stored')
  })

  it('leaves out an entry it was not asked for, so a refused one is never read', async () => {
    const archive = await archiveOf([
      { name: 'a.md', bytes: CONTENT },
      { name: 'b.md', bytes: CONTENT },
    ])
    const taken: string[] = []

    await eachTarFile(archive, new Set(['a.md']), (name) => {
      taken.push(name)
    })

    expect(taken).toStrictEqual(['a.md'])
  })

  it('carries out the failure of whatever was taking the bytes', async () => {
    const archive = await archiveOf([{ name: 'a.md', bytes: CONTENT }])

    await expect(
      eachTarFile(archive, new Set(['a.md']), () => {
        throw new Error('the caller could not store it')
      }),
    ).rejects.toThrow('the caller could not store it')
  })
})

describe('an archive that is not a tar at all', () => {
  it('is refused rather than read as empty', async () => {
    const target = path.join(root, 'not.tar.gz')
    await fs.writeFile(target, 'plain text, never compressed')

    await expect(readTarEntries(target)).rejects.toThrow()
  })
})
