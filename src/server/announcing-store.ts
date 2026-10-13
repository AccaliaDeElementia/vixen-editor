'use sanity'

import type { Actor } from './platform/actor.ts'
import type { Changes } from './platform/changes.ts'
import type { DocumentStore } from './storage/fs-store.ts'
import type { MoveRequest } from './storage/move.ts'
import type { RelinkOutcome } from './storage/relink-store.ts'
import type { RestoreOutcome, RestoreSelection } from './storage/restore.ts'
import { STORE_ROOT } from '../shared/store-path.ts'

export function announcingStore(store: DocumentStore, changes: Changes): DocumentStore {
  function written(path: string): void {
    changes.announce({ path, kind: 'written' })
  }

  function removed(path: string): void {
    changes.announce({ path, kind: 'removed' })
  }

  return {
    ...store,

    async createDocument(id: string, content: string, actor: Actor): Promise<string> {
      const etag = await store.createDocument(id, content, actor)
      written(id)

      return etag
    },

    async createFolder(folderPath: string, indexContent: string, actor: Actor): Promise<string> {
      const etag = await store.createFolder(folderPath, indexContent, actor)
      written(folderPath)

      return etag
    },

    async createUpload(directory: string, filename: string, bytes: Uint8Array, actor: Actor): Promise<string> {
      const entryPath = await store.createUpload(directory, filename, bytes, actor)
      written(entryPath)

      return entryPath
    },

    async updateDocument(id: string, content: string, expectedEtag: string, actor: Actor): Promise<string> {
      const etag = await store.updateDocument(id, content, expectedEtag, actor)
      written(id)

      return etag
    },

    async move(request: MoveRequest, actor: Actor): Promise<RelinkOutcome> {
      const outcome = await store.move(request, actor)
      changes.announce({ kind: 'moved', from: request.from, to: request.to })
      for (const path of outcome.rewritten) written(path)

      return outcome
    },

    async trash(entryPath: string, actor: Actor): Promise<string> {
      const entryId = await store.trash(entryPath, actor)
      removed(entryPath)

      return entryId
    },

    async restore(request: RestoreSelection, actor: Actor): Promise<RestoreOutcome> {
      const outcome = await store.restore(request, actor)
      for (const path of outcome.restored) written(path)

      return outcome
    },

    async purge(entryId: string, actor: Actor): Promise<void> {
      await store.purge(entryId, actor)
      removed(STORE_ROOT)
    },

    async emptyTrash(actor: Actor): Promise<number> {
      const purged = await store.emptyTrash(actor)
      removed(STORE_ROOT)

      return purged
    },
  }
}
