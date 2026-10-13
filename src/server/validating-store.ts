'use sanity'

import type { Actor } from './platform/actor.ts'
import type { ArchiveLimits } from './storage/archive.ts'
import type { StoreLayer } from './storage/fs-store.ts'
import type { MoveRequest } from './storage/move.ts'
import { assertEntryName, assertFolderName, joinEntryPath } from './storage/primitives/safe-path.ts'
import type { RelinkOutcome } from './storage/relink-store.ts'
import type { RestoreOutcome, RestoreSelection } from './storage/restore.ts'
import { DOCUMENT_EXTENSIONS, UPLOAD_EXTENSIONS } from '../shared/documents.ts'

function assertDocument(id: string): void {
  assertEntryName(id, DOCUMENT_EXTENSIONS)
}

function assertUpload(entryPath: string): void {
  assertEntryName(entryPath, UPLOAD_EXTENSIONS)
}

export function validatingStore(store: StoreLayer): StoreLayer {
  return {
    ...store,

    async read(id: string): Promise<string> {
      assertDocument(id)

      return await store.read(id)
    },

    async readBytes(entryPath: string): Promise<Uint8Array<ArrayBuffer>> {
      assertUpload(entryPath)

      return await store.readBytes(entryPath)
    },

    async archive(subtree: string, limits: ArchiveLimits): Promise<ReadableStream<Uint8Array>> {
      assertFolderName(subtree)

      return await store.archive(subtree, limits)
    },

    async createDocument(id: string, content: string, actor: Actor): Promise<string> {
      assertDocument(id)

      return await store.createDocument(id, content, actor)
    },

    async updateDocument(id: string, content: string, expectedEtag: string, actor: Actor): Promise<string> {
      assertDocument(id)

      return await store.updateDocument(id, content, expectedEtag, actor)
    },

    async createFolder(folderPath: string, indexContent: string, actor: Actor): Promise<string> {
      assertFolderName(folderPath)

      return await store.createFolder(folderPath, indexContent, actor)
    },

    async createUpload(directory: string, filename: string, bytes: Uint8Array, actor: Actor): Promise<string> {
      assertUpload(joinEntryPath(directory, filename))

      return await store.createUpload(directory, filename, bytes, actor)
    },

    async move(request: MoveRequest, actor: Actor): Promise<RelinkOutcome> {
      assertFolderName(request.from)
      assertFolderName(request.to)

      return await store.move(request, actor)
    },

    async trash(entryPath: string, actor: Actor): Promise<string> {
      assertFolderName(entryPath)

      return await store.trash(entryPath, actor)
    },

    async restore(request: RestoreSelection, actor: Actor): Promise<RestoreOutcome> {
      if (request.to !== undefined) assertFolderName(request.to)
      for (const within of request.paths) assertFolderName(within)

      return await store.restore(request, actor)
    },
  }
}
