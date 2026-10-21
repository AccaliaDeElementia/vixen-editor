'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import type { Actor } from '../platform/actor.ts'
import { createLogger } from '../platform/logging.ts'
import type { NameComparator } from './primitives/name-order.ts'

import { archiveStream, planArchive, type ArchiveRequest } from './archive.ts'
import { createFileAtomic, replaceFileAtomic } from './primitives/atomic-write.ts'
import { documentIdsUnder } from './document-ids.ts'
import { isAtOrInside, realpathOrNull } from './primitives/containment.ts'
import { computeEtag } from './primitives/etag.ts'
import { createWriteLock, DEFAULT_WRITE_LOCK_TIMEOUT_MS, type WriteLock } from '../platform/lock.ts'
import { moveEntry, type MoveRequest } from './move.ts'
import { relinkAfterMove, type RelinkOutcome, type Rewrite } from './relink-store.ts'
import { assertNormalisedName, InvalidPathError, joinEntryPath, resolveStorePath } from './primitives/safe-path.ts'
import {
  ABSENT_ON_READ_CODES,
  asDocumentError,
  asExistsError,
  ConcurrentModificationError,
} from './primitives/store-errors.ts'
import { stageArchive } from './staging.ts'
import { readTree, type TreeEntry } from './tree.ts'
import {
  emptyTrash,
  moveToTrash,
  purgeFromTrash,
  readTrash,
  type TrashEntry,
  type TrashEntryRecord,
} from './trash/trash.ts'
import { readTrashEntry, type TrashEntryNode } from './trash/trash-entries.ts'
import { restoreSelection, type RestoreOutcome, type RestoreSelection } from './restore.ts'
import { FOLDER_INDEX_NAME } from '../../shared/documents.ts'
import { STORE_ROOT } from '../../shared/store-path.ts'

const logStore = createLogger('storage/fs-store')
const logEscape = createLogger('storage/fs-store', 'symlinkEscape')

export interface StoreLayer {
  list: (byName: NameComparator) => Promise<string[]>
  tree: (byName: NameComparator) => Promise<TreeEntry[]>
  read: (id: string) => Promise<string>
  createDocument: (id: string, content: string, actor: Actor) => Promise<string>
  createFolder: (folderPath: string, indexContent: string, actor: Actor) => Promise<string>
  createUpload: (directory: string, filename: string, bytes: Uint8Array, actor: Actor) => Promise<string>
  readBytes: (entryPath: string) => Promise<Uint8Array<ArrayBuffer>>
  updateDocument: (id: string, content: string, expectedEtag: string, actor: Actor) => Promise<string>
  archive: (subtree: string, request: ArchiveRequest) => Promise<ReadableStream<Uint8Array>>
  move: (request: MoveRequest, actor: Actor) => Promise<RelinkOutcome>
  trash: (entryPath: string, actor: Actor) => Promise<string>
  listTrash: () => Promise<TrashEntryRecord[]>
  trashEntry: (entryId: string) => Promise<TrashEntryNode>
  restore: (request: RestoreSelection, actor: Actor) => Promise<RestoreOutcome>
  purge: (entryId: string, actor: Actor) => Promise<void>
  emptyTrash: (actor: Actor) => Promise<number>
  stageArchive: () => Promise<string>
}

export interface DocumentStore extends Omit<StoreLayer, 'listTrash'> {
  listTrash: () => Promise<TrashEntry[]>
}

async function readDocument(id: string, target: string): Promise<string> {
  try {
    return await fs.readFile(target, 'utf8')
  } catch (error) {
    throw asDocumentError(id, error, ABSENT_ON_READ_CODES)
  }
}

async function assertResolvesInsideRoot(root: string, id: string, target: string): Promise<void> {
  const realTarget = await realpathOrNull(target)
  if (realTarget === null) return

  const realRoot = await realpathOrNull(root)
  /* v8 ignore next -- the root necessarily exists once a target inside it resolved */
  if (realRoot === null) return

  if (!isAtOrInside(realRoot, realTarget)) {
    logEscape('rejected %s: %s resolves to %s, outside %s', id, target, realTarget, realRoot)
    throw new InvalidPathError(id, 'resolves outside the document root')
  }
}

export function createFsDocumentStore(
  docsRoot: string,
  rewrite: Rewrite,
  lock: WriteLock = createWriteLock(DEFAULT_WRITE_LOCK_TIMEOUT_MS),
): StoreLayer {
  const root = path.resolve(docsRoot)

  return {
    async list(byName: NameComparator): Promise<string[]> {
      return (await documentIdsUnder(root, STORE_ROOT)).sort(byName)
    },

    async tree(byName: NameComparator): Promise<TreeEntry[]> {
      return await readTree(root, byName)
    },

    async read(id: string): Promise<string> {
      const target = resolveStorePath(root, id)
      await assertResolvesInsideRoot(root, id, target)

      return await readDocument(id, target)
    },

    async updateDocument(id: string, content: string, expectedEtag: string): Promise<string> {
      const target = resolveStorePath(root, id)

      return await lock.run(async () => {
        await assertResolvesInsideRoot(root, id, target)

        const current = await readDocument(id, target)
        if (computeEtag(current) !== expectedEtag) throw new ConcurrentModificationError(id)

        await replaceFileAtomic(target, content)
        logStore('updated %s (%d bytes)', id, content.length)
        return computeEtag(content)
      })
    },

    async createDocument(id: string, content: string): Promise<string> {
      assertNormalisedName(id)
      const target = resolveStorePath(root, id)

      return await lock.run(async () => {
        const parent = path.dirname(target)
        await fs.mkdir(parent, { recursive: true })
        await assertResolvesInsideRoot(root, id, parent)

        try {
          await createFileAtomic(target, content)
        } catch (error) {
          throw asExistsError(id, error)
        }
        logStore('created %s (%d bytes)', id, content.length)
        return computeEtag(content)
      })
    },

    async createFolder(folderPath: string, indexContent: string): Promise<string> {
      assertNormalisedName(folderPath)
      const target = resolveStorePath(root, folderPath)

      return await lock.run(async () => {
        const parent = path.dirname(target)
        await fs.mkdir(parent, { recursive: true })
        await assertResolvesInsideRoot(root, folderPath, parent)

        try {
          await fs.mkdir(target)
        } catch (error) {
          throw asExistsError(folderPath, error)
        }
        await createFileAtomic(path.join(target, FOLDER_INDEX_NAME), indexContent)
        logStore('created folder %s', folderPath)
        return computeEtag(indexContent)
      })
    },

    stageArchive: async () => await stageArchive(root),

    async createUpload(directory: string, filename: string, bytes: Uint8Array): Promise<string> {
      const entryPath = joinEntryPath(directory, filename)
      assertNormalisedName(entryPath)
      const target = resolveStorePath(root, entryPath)

      return await lock.run(async () => {
        const parent = path.dirname(target)
        await fs.mkdir(parent, { recursive: true })
        await assertResolvesInsideRoot(root, entryPath, parent)

        try {
          await createFileAtomic(target, bytes)
        } catch (error) {
          throw asExistsError(entryPath, error)
        }
        logStore('uploaded %s (%d bytes)', entryPath, bytes.length)
        return entryPath
      })
    },

    async readBytes(entryPath: string): Promise<Uint8Array<ArrayBuffer>> {
      const target = resolveStorePath(root, entryPath)
      await assertResolvesInsideRoot(root, entryPath, target)

      try {
        // Copied out of the Buffer that readFile returns, whose backing store is
        // a shared pool slice rather than an ArrayBuffer of its own.
        return new Uint8Array(await fs.readFile(target))
      } catch (error) {
        throw asDocumentError(entryPath, error, ABSENT_ON_READ_CODES)
      }
    },

    async archive(subtree: string, request: ArchiveRequest): Promise<ReadableStream<Uint8Array>> {
      return archiveStream(await planArchive(root, subtree, request), request.format)
    },

    async move(request: MoveRequest): Promise<RelinkOutcome> {
      return await lock.run(async () => {
        const before = await documentIdsUnder(root, STORE_ROOT)
        await moveEntry(root, request)

        return await relinkAfterMove(root, before, [{ from: request.from, to: request.to }], rewrite)
      })
    },

    async trash(entryPath: string, actor: Actor): Promise<string> {
      return await lock.run(async () => await moveToTrash(root, entryPath, actor))
    },

    async listTrash(): Promise<TrashEntryRecord[]> {
      return await readTrash(root)
    },

    async trashEntry(entryId: string): Promise<TrashEntryNode> {
      return await readTrashEntry(root, entryId)
    },

    async restore(request: RestoreSelection): Promise<RestoreOutcome> {
      return await lock.run(async () => await restoreSelection(root, request, rewrite))
    },

    async purge(entryId: string): Promise<void> {
      await lock.run(async () => {
        await purgeFromTrash(root, entryId)
      })
    },

    async emptyTrash(): Promise<number> {
      return await lock.run(async () => await emptyTrash(root))
    },
  }
}
