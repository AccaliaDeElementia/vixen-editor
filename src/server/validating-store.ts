'use sanity'

import type { Actor } from './platform/actor.ts'
import type { ArchiveLimits } from './storage/archive.ts'
import type { StoreLayer } from './storage/fs-store.ts'
import type { MoveRequest } from './storage/move.ts'
import { assertEntryName, assertFolderName, joinEntryPath } from './storage/primitives/safe-path.ts'
import { contentMatchesExtension, detectedFormat } from './storage/primitives/signatures.ts'
import { ContentMismatchError, EmptyContentError } from './storage/primitives/store-errors.ts'
import type { RelinkOutcome } from './storage/relink-store.ts'
import type { RestoreOutcome, RestoreSelection } from './storage/restore.ts'
import { isBlank } from '../shared/content.ts'
import { DOCUMENT_EXTENSIONS, UPLOAD_EXTENSIONS } from '../shared/documents.ts'
import { EMPTY } from '../shared/sequences.ts'

function assertDocument(id: string): void {
  assertEntryName(id, DOCUMENT_EXTENSIONS)
}

function assertUpload(entryPath: string): void {
  assertEntryName(entryPath, UPLOAD_EXTENSIONS)
}

function assertNotBlank(id: string, content: string): void {
  if (isBlank(content)) throw new EmptyContentError(id)
}

function assertUploadable(entryPath: string, bytes: Uint8Array): void {
  if (bytes.length === EMPTY) throw new EmptyContentError(entryPath)

  if (!contentMatchesExtension(entryPath, bytes)) {
    throw new ContentMismatchError(entryPath, detectedFormat(bytes))
  }
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
      assertNotBlank(id, content)

      return await store.createDocument(id, content, actor)
    },

    async updateDocument(id: string, content: string, expectedEtag: string, actor: Actor): Promise<string> {
      assertDocument(id)
      assertNotBlank(id, content)

      return await store.updateDocument(id, content, expectedEtag, actor)
    },

    async createFolder(folderPath: string, indexContent: string, actor: Actor): Promise<string> {
      assertFolderName(folderPath)
      assertNotBlank(folderPath, indexContent)

      return await store.createFolder(folderPath, indexContent, actor)
    },

    async createUpload(directory: string, filename: string, bytes: Uint8Array, actor: Actor): Promise<string> {
      const entryPath = joinEntryPath(directory, filename)
      assertUpload(entryPath)
      assertUploadable(entryPath, bytes)

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
