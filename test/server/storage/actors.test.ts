'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { givenAsync } from '../../conditions.ts'
import { anonymousActor, localActor } from '../../../src/server/platform/actor.ts'
import { createWriteLock, DEFAULT_WRITE_LOCK_TIMEOUT_MS } from '../../../src/server/platform/lock.ts'
import { createActors, type Actors } from '../../../src/server/storage/actors.ts'

const ACTORS_FILE = path.join('.vixen', 'actors.json')
const VISITOR = anonymousActor('198.51.100.3')

let root = ''
let actors: Actors = createActors('', createWriteLock(DEFAULT_WRITE_LOCK_TIMEOUT_MS))

function freshActors(): Actors {
  return createActors(root, createWriteLock(DEFAULT_WRITE_LOCK_TIMEOUT_MS))
}

async function writeStoredActors(contents: string): Promise<void> {
  await fs.mkdir(path.join(root, '.vixen'), { recursive: true })
  await fs.writeFile(path.join(root, ACTORS_FILE), contents)
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-actors-'))
  actors = freshActors()
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('remembering an actor', () => {
  it('resolves one it was told about', async () => {
    await givenAsync(actors.remember(VISITOR))

    expect(await actors.resolve(VISITOR.id)).toStrictEqual(VISITOR)
  })

  it('keeps it for a later run, which is what the file is for', async () => {
    await givenAsync(actors.remember(VISITOR))

    expect(await freshActors().resolve(VISITOR.id)).toStrictEqual(VISITOR)
  })

  it('writes it where the application keeps its bookkeeping', async () => {
    await givenAsync(actors.remember(VISITOR))

    expect(JSON.parse(await fs.readFile(path.join(root, ACTORS_FILE), 'utf8'))).toMatchObject({
      [VISITOR.id]: { name: VISITOR.name, kind: VISITOR.kind },
    })
  })

  it('records the user the server runs as alongside, so the file names every id it holds', async () => {
    await givenAsync(actors.remember(VISITOR))

    expect(JSON.parse(await fs.readFile(path.join(root, ACTORS_FILE), 'utf8'))).toMatchObject({
      [localActor().id]: { name: localActor().name, kind: 'local' },
    })
  })

  it('writes nothing when it already holds the same record, so a repeat costs no write', async () => {
    await givenAsync(actors.remember(VISITOR))
    const written = await givenAsync(fs.stat(path.join(root, ACTORS_FILE)))

    await actors.remember(VISITOR)

    expect((await fs.stat(path.join(root, ACTORS_FILE))).mtimeMs).toBe(written.mtimeMs)
  })
})

describe('resolving an actor the store cannot produce', () => {
  it('reports an unknown actor rather than failing, so a deleted user cannot break an operation', async () => {
    expect(await actors.resolve('unauth:203.0.113.9')).toStrictEqual({
      id: 'unauth:203.0.113.9',
      name: 'Unknown Actor',
      kind: 'unknown',
    })
  })

  it('survives the file being absent entirely', async () => {
    expect((await actors.resolve('unauth:203.0.113.9')).kind).toBe('unknown')
  })

  it('rebuilds a file that does not hold JSON rather than refusing to start', async () => {
    await givenAsync(writeStoredActors('{ not json'))

    expect((await freshActors().resolve(VISITOR.id)).kind).toBe('unknown')
  })

  it('rebuilds a file holding JSON that is not a set of records at all', async () => {
    await givenAsync(writeStoredActors(JSON.stringify([VISITOR])))

    expect((await freshActors().resolve(VISITOR.id)).kind).toBe('unknown')
  })

  it('discards an entry that is not an actor and keeps the ones that are', async () => {
    await givenAsync(writeStoredActors(JSON.stringify({ 'unauth:1.1.1.1': 7, [VISITOR.id]: VISITOR })))

    expect(await freshActors().resolve(VISITOR.id)).toStrictEqual(VISITOR)
  })

  it('discards an entry whose kind is not one the application knows', async () => {
    await givenAsync(writeStoredActors(JSON.stringify({ [VISITOR.id]: { name: 'x', kind: 'administrator' } })))

    expect((await freshActors().resolve(VISITOR.id)).kind).toBe('unknown')
  })

  it('heals a file it could not read, so the next actor is kept', async () => {
    await givenAsync(writeStoredActors('{ not json'))
    const healed = freshActors()

    await healed.remember(VISITOR)

    expect(await freshActors().resolve(VISITOR.id)).toStrictEqual(VISITOR)
  })
})

describe('the user the server runs as', () => {
  it('is known without anyone recording it, because unattributed content belongs to them', async () => {
    expect(await actors.resolve(localActor().id)).toStrictEqual(localActor())
  })

  it('is not written to the file merely for being known', async () => {
    await givenAsync(actors.remember(localActor()))

    expect(await fs.readdir(root)).toStrictEqual([])
  })
})
