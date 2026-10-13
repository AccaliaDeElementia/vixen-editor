'use sanity'

import { describe, expect, it } from 'vitest'

import { givenAsync } from '../conditions.ts'
import { anonymousActor, type Actor } from '../../src/server/platform/actor.ts'
import { resolvingActors } from '../../src/server/resolving-actors.ts'
import type { Actors } from '../../src/server/storage/actors.ts'
import type { StoreLayer } from '../../src/server/storage/fs-store.ts'
import type { TrashEntryRecord } from '../../src/server/storage/trash/trash.ts'
import { failingStore } from './failing-store.ts'

const VISITOR = anonymousActor('198.51.100.3')
const STRANGER = anonymousActor('203.0.113.8')

function recordFor(deletedBy: string): TrashEntryRecord {
  return { id: 'e1', originalPath: 'gone.md', deletedAt: '2026-01-01T00:00:00.000Z', kind: 'document', deletedBy }
}

function knowing(...actors: Actor[]): Actors & { remembered: Actor[] } {
  const held = new Map(actors.map((actor) => [actor.id, actor]))
  const remembered: Actor[] = []

  return {
    remembered,
    resolve: async (id: string) =>
      await Promise.resolve(held.get(id) ?? { id, name: 'Unknown Actor', kind: 'unknown' as const }),
    remember: async (actor: Actor) => {
      remembered.push(actor)
      await Promise.resolve()
    },
  }
}

function layerWith(records: TrashEntryRecord[]): StoreLayer & { credited: Actor[] } {
  const credited: Actor[] = []

  return {
    ...failingStore(),
    credited,
    listTrash: async () => await Promise.resolve(records),
    trash: async (_entryPath: string, actor: Actor) => {
      credited.push(actor)

      return await Promise.resolve('e1')
    },
  }
}

describe('the trash listing', () => {
  it('names who deleted an entry rather than handing on the id it stored', async () => {
    const store = resolvingActors(layerWith([recordFor(VISITOR.id)]), knowing(VISITOR))

    expect((await store.listTrash()).map((entry) => entry.deletedBy)).toStrictEqual([VISITOR])
  })

  it('reports an actor the store has lost as unknown, so a listing still renders', async () => {
    const store = resolvingActors(layerWith([recordFor('unauth:10.0.0.9')]), knowing(VISITOR))

    expect((await store.listTrash()).map((entry) => entry.deletedBy.kind)).toStrictEqual(['unknown'])
  })

  it('leaves the rest of an entry as the layer reported it', async () => {
    const store = resolvingActors(layerWith([recordFor(VISITOR.id)]), knowing(VISITOR))

    expect((await store.listTrash()).map((entry) => entry.originalPath)).toStrictEqual(['gone.md'])
  })

  it('resolves each entry separately, so two deleters are told apart', async () => {
    const records = [recordFor(VISITOR.id), { ...recordFor(STRANGER.id), id: 'e2' }]
    const store = resolvingActors(layerWith(records), knowing(VISITOR, STRANGER))

    expect((await store.listTrash()).map((entry) => entry.deletedBy.name)).toStrictEqual([VISITOR.name, STRANGER.name])
  })
})

describe('trashing', () => {
  it('records the actor, so a later listing can still name them', async () => {
    const actors = knowing()
    const store = resolvingActors(layerWith([]), actors)

    await store.trash('gone.md', VISITOR)

    expect(actors.remembered).toStrictEqual([VISITOR])
  })

  it('hands the actor to the layer it decorates', async () => {
    const layer = layerWith([])
    const store = resolvingActors(layer, knowing())

    await store.trash('gone.md', VISITOR)

    expect(layer.credited).toStrictEqual([VISITOR])
  })

  it('returns what the layer did, rather than inventing an entry id', async () => {
    const store = resolvingActors(layerWith([]), knowing())

    expect(await store.trash('gone.md', VISITOR)).toBe('e1')
  })

  it('remembers nobody when the layer refuses, so a failed delete credits no one', async () => {
    const actors = knowing()
    const store = resolvingActors(failingStore(), actors)

    await givenAsync(expect(store.trash('gone.md', VISITOR)).rejects.toThrow())

    expect(actors.remembered).toStrictEqual([])
  })
})
