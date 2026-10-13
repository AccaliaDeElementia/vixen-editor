'use sanity'

import { createWriteLock, DEFAULT_WRITE_LOCK_TIMEOUT_MS, type WriteLock } from '../../src/server/platform/lock.ts'
import { resolvingActors } from '../../src/server/resolving-actors.ts'
import { validatingStore } from '../../src/server/validating-store.ts'
import { unknownActor } from '../../src/server/platform/actor.ts'
import { createActors, type Actors } from '../../src/server/storage/actors.ts'
import { createFsDocumentStore, type DocumentStore, type StoreLayer } from '../../src/server/storage/fs-store.ts'

export function documentStoreIn(
  root: string,
  lock: WriteLock = createWriteLock(DEFAULT_WRITE_LOCK_TIMEOUT_MS),
): DocumentStore {
  return resolvingActors(validatingStore(createFsDocumentStore(root, lock)), createActors(root, lock))
}

export function documentStoreOver(layer: StoreLayer, root = ''): DocumentStore {
  return resolvingActors(validatingStore(layer), createActors(root, createWriteLock(DEFAULT_WRITE_LOCK_TIMEOUT_MS)))
}

export const forgetfulActors: Actors = {
  resolve: async (id: string) => await Promise.resolve(unknownActor(id)),
  remember: async () => {
    await Promise.resolve()
  },
}
