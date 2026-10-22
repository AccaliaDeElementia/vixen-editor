'use sanity'

import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { eachZipFile, readZipEntries } from '../../../src/server/storage/zip-entries.ts'
import { DIRECTORY_MODE, REGULAR_MODE, SYMLINK_MODE, zipOf, type FixtureEntry } from './zip-fixtures.ts'

const CONTENT = new TextEncoder().encode('# stored')
const CLAIMS_MORE = 16
const CENTRAL_UNCOMPRESSED_SIZE = 24
const LOCAL_FLAGS = 6
const CENTRAL_FLAGS = 8
const NO_UTF8_FLAG = 0
const ENCRYPTED_FLAG = 1
const LAST_ASCII = '\u007f'
const CENTRAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x01, 0x02])

let root = ''

async function archiveOf(entries: readonly FixtureEntry[]): Promise<string> {
  const target = path.join(root, 'in.zip')
  await fs.writeFile(target, zipOf(entries))

  return target
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-zip-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('reading what a zip declares', () => {
  it('names every entry it holds', async () => {
    const found = await readZipEntries(await archiveOf([{ name: 'journal/a.md', bytes: CONTENT }]))

    expect(found.map((entry) => entry.name)).toStrictEqual(['journal/a.md'])
  })

  it('reports the size the archive claims, which is a claim rather than a fact', async () => {
    const found = await readZipEntries(await archiveOf([{ name: 'a.md', bytes: CONTENT }]))

    expect(found.at(0)?.declaredBytes).toBe(CONTENT.length)
  })

  it('reads a regular file as one', async () => {
    const found = await readZipEntries(await archiveOf([{ name: 'a.md', bytes: CONTENT, mode: REGULAR_MODE }]))

    expect(found.at(0)?.kind).toBe('file')
  })

  it('reads an entry with no unix mode as a file, because a windows zip records none', async () => {
    const found = await readZipEntries(await archiveOf([{ name: 'a.md', bytes: CONTENT }]))

    expect(found.at(0)?.kind).toBe('file')
  })
})

describe('an entry that is not a regular file', () => {
  it('reads a symlink as something else, so one rule can refuse every such entry', async () => {
    const found = await readZipEntries(await archiveOf([{ name: 'link', mode: SYMLINK_MODE }]))

    expect(found.at(0)?.kind).toBe('other')
  })

  it('reads a trailing slash as a directory, which is how a zip spells one', async () => {
    const found = await readZipEntries(await archiveOf([{ name: 'journal/', mode: DIRECTORY_MODE }]))

    expect(found.at(0)?.kind).toBe('directory')
  })
})

describe('a name the archive chose', () => {
  it('is handed over exactly as declared, never repaired', async () => {
    const found = await readZipEntries(await archiveOf([{ name: '../../../etc/evil.md', bytes: CONTENT }]))

    expect(found.at(0)?.name).toBe('../../../etc/evil.md')
  })

  it('keeps an absolute one too, so the verdict is what refuses it', async () => {
    const found = await readZipEntries(await archiveOf([{ name: '/absolute.md', bytes: CONTENT }]))

    expect(found.at(0)?.name).toBe('/absolute.md')
  })

  it('names an entry holding the last ascii byte, which is still ascii', async () => {
    const archive = await archiveOf([{ name: `a${LAST_ASCII}.md`, bytes: CONTENT }])
    const whole = await fs.readFile(archive)
    whole.writeUInt16LE(NO_UTF8_FLAG, LOCAL_FLAGS)
    whole.writeUInt16LE(NO_UTF8_FLAG, whole.indexOf(CENTRAL_FILE_HEADER) + CENTRAL_FLAGS)
    await fs.writeFile(archive, whole)

    const found = await readZipEntries(archive)

    expect(found.at(0)?.name).toBe(`a${LAST_ASCII}.md`)
  })

  it('refuses to name an accented entry the archive never flagged as unicode', async () => {
    const archive = await archiveOf([{ name: 'journal/café.md', bytes: CONTENT }])
    const whole = await fs.readFile(archive)
    whole.writeUInt16LE(NO_UTF8_FLAG, LOCAL_FLAGS)
    whole.writeUInt16LE(NO_UTF8_FLAG, whole.indexOf(CENTRAL_FILE_HEADER) + CENTRAL_FLAGS)
    await fs.writeFile(archive, whole)

    const found = await readZipEntries(archive)

    expect(found.at(0)?.name).toBeNull()
  })

  it('reports an entry the archive flagged as encrypted, which the verdict refuses', async () => {
    const archive = await archiveOf([{ name: 'secret.md', bytes: CONTENT }])
    const whole = await fs.readFile(archive)
    whole.writeUInt16LE(ENCRYPTED_FLAG, whole.indexOf(CENTRAL_FILE_HEADER) + CENTRAL_FLAGS)
    await fs.writeFile(archive, whole)

    const found = await readZipEntries(archive)

    expect(found.at(0)?.encrypted).toBe(true)
  })

  it('reports an ordinary entry as unencrypted, which is what lets the verdict take it', async () => {
    const found = await readZipEntries(await archiveOf([{ name: 'notes.md', bytes: CONTENT }]))

    expect(found.at(0)?.encrypted).toBe(false)
  })

  it('reads an accented name the archive flagged as unicode', async () => {
    const found = await readZipEntries(await archiveOf([{ name: 'journal/café.md', bytes: CONTENT }]))

    expect(found.at(0)?.name).toBe('journal/café.md')
  })
})

describe('an archive that is not one', () => {
  it('is refused rather than read as empty', async () => {
    const target = path.join(root, 'not.zip')
    await fs.writeFile(target, 'plain text, no central directory')

    await expect(readZipEntries(target)).rejects.toThrow()
  })
})

describe('taking the contents of the entries it was asked for', () => {
  it('hands over what an entry holds', async () => {
    const archive = await archiveOf([{ name: 'a.md', bytes: CONTENT }])
    const taken = new Map<string, string>()

    await eachZipFile(archive, new Set(['a.md']), (name, bytes) => {
      taken.set(name, new TextDecoder().decode(bytes))
    })

    expect(taken.get('a.md')).toBe('# stored')
  })

  it('leaves out an entry it was not asked for, so a refused one is never read', async () => {
    const archive = await archiveOf([
      { name: 'a.md', bytes: CONTENT },
      { name: 'link', mode: SYMLINK_MODE },
    ])
    const taken: string[] = []

    await eachZipFile(archive, new Set(['a.md']), (name) => {
      taken.push(name)
    })

    expect(taken).toStrictEqual(['a.md'])
  })

  it('takes them one at a time, so only one entry is ever held', async () => {
    const archive = await archiveOf([
      { name: 'a.md', bytes: CONTENT },
      { name: 'b.md', bytes: CONTENT },
    ])
    let atOnce = 0
    let most = 0

    await eachZipFile(archive, new Set(['a.md', 'b.md']), async () => {
      atOnce += 1
      most = Math.max(most, atOnce)
      await Promise.resolve()
      atOnce -= 1
    })

    expect(most).toBe(1)
  })
})

describe('taking from an archive that cannot be read', () => {
  it('refuses rather than hand over nothing', async () => {
    const target = path.join(root, 'not.zip')
    await fs.writeFile(target, 'plain text, no central directory')

    await expect(eachZipFile(target, new Set(['a.md']), () => undefined)).rejects.toThrow()
  })

  it('carries out the failure of whatever was taking the bytes', async () => {
    const archive = await archiveOf([{ name: 'a.md', bytes: CONTENT }])

    await expect(
      eachZipFile(archive, new Set(['a.md']), () => {
        throw new Error('the caller could not store it')
      }),
    ).rejects.toThrow('the caller could not store it')
  })

  it('refuses an entry whose bytes do not match what the archive claimed', async () => {
    const archive = await archiveOf([{ name: 'a.md', bytes: CONTENT }])
    const whole = await fs.readFile(archive)
    const record = whole.indexOf(CENTRAL_FILE_HEADER)
    whole.writeUInt32LE(CONTENT.length + CLAIMS_MORE, record + CENTRAL_UNCOMPRESSED_SIZE)
    await fs.writeFile(archive, whole)

    await expect(eachZipFile(archive, new Set(['a.md']), () => undefined)).rejects.toThrow()
  })
})
