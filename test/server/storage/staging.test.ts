'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearStaging, stageArchive, TestOnly } from '../../../src/server/storage/staging.ts'
import { givenAsync } from '../../conditions.ts'

const { STAGING_DIRECTORY, stagingRoot } = TestOnly

const NOTHING_REMOVED: string[] = []

let root = ''

async function write(entryPath: string, content = 'x'): Promise<void> {
  await fs.mkdir(path.join(root, path.dirname(entryPath)), { recursive: true })
  await fs.writeFile(path.join(root, entryPath), content)
}

async function exists(entryPath: string): Promise<boolean> {
  return await fs
    .stat(path.join(root, entryPath))
    .then(() => true)
    .catch(() => false)
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-staging-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('where an import is staged', () => {
  it('sits beside the trash rather than inside the configuration folder', () => {
    expect(STAGING_DIRECTORY).toBe('.imports')
  })

  it('is a path under the store, so a rename into place stays on one filesystem', () => {
    expect(stagingRoot(root)).toBe(path.join(root, STAGING_DIRECTORY))
  })
})

describe('clearing what a crashed import left behind', () => {
  it('removes a staged tree, because no staged file can belong to a live import at startup', async () => {
    await write(`${STAGING_DIRECTORY}/abandoned/journal/a.md`)

    await clearStaging(root)

    expect(await exists(`${STAGING_DIRECTORY}/abandoned`)).toBe(false)
  })

  it('names what it removed, so a crash leaves a trace in the log', async () => {
    await write(`${STAGING_DIRECTORY}/abandoned/journal/a.md`)
    await write(`${STAGING_DIRECTORY}/half.zip`)

    expect(await clearStaging(root)).toStrictEqual(['abandoned', 'half.zip'])
  })

  it('reports nothing when the store has never staged an import', async () => {
    expect(await clearStaging(root)).toStrictEqual(NOTHING_REMOVED)
  })

  it('reports nothing when staging survives an earlier clear with nothing in it', async () => {
    await fs.mkdir(path.join(root, STAGING_DIRECTORY), { recursive: true })

    expect(await clearStaging(root)).toStrictEqual(NOTHING_REMOVED)
  })

  it('leaves the trash alone, which holds what a reader deleted on purpose', async () => {
    await write('.trash/aaaa/payload')
    await write(`${STAGING_DIRECTORY}/abandoned/a.md`)

    await clearStaging(root)

    expect(await exists('.trash/aaaa/payload')).toBe(true)
  })

  it('leaves the configuration folder alone, which holds who did what', async () => {
    await write('.vixen/actors.json', '{}')
    await write(`${STAGING_DIRECTORY}/abandoned/a.md`)

    await clearStaging(root)

    expect(await exists('.vixen/actors.json')).toBe(true)
  })

  it('leaves the documents alone, which is the whole point of the store', async () => {
    await write('journal/a.md')
    await write(`${STAGING_DIRECTORY}/abandoned/a.md`)

    await clearStaging(root)

    expect(await exists('journal/a.md')).toBe(true)
  })
})

describe('stageArchive', () => {
  it('stages into a directory an earlier archive already created', async () => {
    await givenAsync(expect(stageArchive(root)).resolves.toContain(STAGING_DIRECTORY))

    await expect(stageArchive(root)).resolves.toContain(STAGING_DIRECTORY)
  })
})
