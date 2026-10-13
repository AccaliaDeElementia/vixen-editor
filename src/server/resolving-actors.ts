'use sanity'

import type { Actor } from './platform/actor.ts'
import type { Actors } from './storage/actors.ts'
import type { DocumentStore, StoreLayer } from './storage/fs-store.ts'
import type { TrashEntry, TrashEntryRecord } from './storage/trash/trash.ts'

export function resolvingActors(store: StoreLayer, actors: Actors): DocumentStore {
  async function credited(record: TrashEntryRecord): Promise<TrashEntry> {
    return { ...record, deletedBy: await actors.resolve(record.deletedBy) }
  }

  return {
    ...store,

    async listTrash(): Promise<TrashEntry[]> {
      return await Promise.all((await store.listTrash()).map(credited))
    },

    async trash(entryPath: string, actor: Actor): Promise<string> {
      const entryId = await store.trash(entryPath, actor)
      await actors.remember(actor)

      return entryId
    },
  }
}
