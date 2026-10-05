'use sanity'

import type { Changes } from './changes.ts'
import type { DocumentStore } from './storage/fs-store.ts'
import type { MoveRequest } from './storage/move.ts'
import type { RelinkOutcome } from './storage/relink-store.ts'
import type { RestoreOutcome, RestoreSelection } from './storage/trash-restore.ts'
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

    async createDocument(id: string, content: string): Promise<string> {
      const etag = await store.createDocument(id, content)
      written(id)

      return etag
    },

    async createFolder(folderPath: string, indexContent: string): Promise<string> {
      const etag = await store.createFolder(folderPath, indexContent)
      written(folderPath)

      return etag
    },

    async createUpload(directory: string, filename: string, bytes: Uint8Array): Promise<string> {
      const entryPath = await store.createUpload(directory, filename, bytes)
      written(entryPath)

      return entryPath
    },

    async updateDocument(id: string, content: string, expectedEtag: string): Promise<string> {
      const etag = await store.updateDocument(id, content, expectedEtag)
      written(id)

      return etag
    },

    async move(request: MoveRequest): Promise<RelinkOutcome> {
      const outcome = await store.move(request)
      changes.announce({ kind: 'moved', from: request.from, to: request.to })
      for (const path of outcome.rewritten) written(path)

      return outcome
    },

    async trash(entryPath: string): Promise<string> {
      const entryId = await store.trash(entryPath)
      removed(entryPath)

      return entryId
    },

    async restore(request: RestoreSelection): Promise<RestoreOutcome> {
      const outcome = await store.restore(request)
      for (const path of outcome.restored) written(path)

      return outcome
    },

    async purge(entryId: string): Promise<void> {
      await store.purge(entryId)
      removed(STORE_ROOT)
    },

    async emptyTrash(): Promise<number> {
      const purged = await store.emptyTrash()
      removed(STORE_ROOT)

      return purged
    },
  }
}
