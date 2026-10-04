'use sanity'

import { EMPTY } from '../../shared/sequences.ts'

import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'
import { compareNamesIn } from './name-order.ts'

import { archiveStream, planArchive, type ArchiveLimits } from './archive.ts'
import { createFileAtomic, replaceFileAtomic } from './atomic-write.ts'
import { documentIdsUnder } from './document-ids.ts'
import { UPLOAD_EXTENSIONS } from '../../shared/documents.ts'
import { isAtOrInside, realpathOrNull } from './containment.ts'
import { computeEtag } from './etag.ts'
import { createWriteLock, DEFAULT_WRITE_LOCK_TIMEOUT_MS, type WriteLock } from './lock.ts'
import { moveEntry, type MoveRequest } from './move.ts'
import { relinkAfterMove, type RelinkOutcome } from './relink-store.ts'
import {
  assertNormalisedName,
  InvalidPathError,
  joinEntryPath,
  resolveDocumentPath,
  resolveEntryPath,
  resolveFolderPath,
} from './safe-path.ts'
import { contentMatchesExtension, detectedFormat } from './signatures.ts'
import {
  ABSENT_ON_READ_CODES,
  asDocumentError,
  asExistsError,
  ConcurrentModificationError,
  ContentMismatchError,
  EmptyContentError,
} from './store-errors.ts'
import { readTree, type TreeEntry } from './tree.ts'
import { emptyTrash, moveToTrash, purgeFromTrash, readTrash, type TrashEntry } from './trash.ts'
import { readTrashEntry, type TrashEntryNode } from './trash-entries.ts'
import { restoreSelection, type RestoreOutcome, type RestoreSelection } from './trash-restore.ts'
import { FOLDER_INDEX_NAME } from '../../shared/documents.ts'
import { isBlank } from '../../shared/content.ts'
import { STORE_ROOT } from '../../shared/store-path.ts'

const logStore = createLogger('storage/fs-store')
const logEscape = createLogger('storage/fs-store', 'symlinkEscape')

export interface DocumentStore {
  list: (locale?: string) => Promise<string[]>
  tree: (locale?: string) => Promise<TreeEntry[]>
  read: (id: string) => Promise<string>
  createDocument: (id: string, content: string) => Promise<string>
  createFolder: (folderPath: string, indexContent: string) => Promise<string>
  createUpload: (directory: string, filename: string, bytes: Uint8Array) => Promise<string>
  readBytes: (entryPath: string) => Promise<Uint8Array<ArrayBuffer>>
  updateDocument: (id: string, content: string, expectedEtag: string) => Promise<string>
  archive: (subtree: string, limits: ArchiveLimits) => Promise<ReadableStream<Uint8Array>>
  move: (request: MoveRequest) => Promise<RelinkOutcome>
  trash: (entryPath: string) => Promise<string>
  listTrash: () => Promise<TrashEntry[]>
  trashEntry: (entryId: string) => Promise<TrashEntryNode>
  restore: (request: RestoreSelection) => Promise<RestoreOutcome>
  purge: (entryId: string) => Promise<void>
  emptyTrash: () => Promise<number>
}

function assertNotBlank(id: string, content: string): void {
  if (isBlank(content)) throw new EmptyContentError(id)
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
  lock: WriteLock = createWriteLock(DEFAULT_WRITE_LOCK_TIMEOUT_MS),
): DocumentStore {
  const root = path.resolve(docsRoot)

  return {
    async list(locale?: string): Promise<string[]> {
      return (await documentIdsUnder(root, STORE_ROOT)).sort(compareNamesIn(locale))
    },

    async tree(locale?: string): Promise<TreeEntry[]> {
      return await readTree(root, locale)
    },

    async read(id: string): Promise<string> {
      const target = resolveDocumentPath(root, id)
      await assertResolvesInsideRoot(root, id, target)

      return await readDocument(id, target)
    },

    async updateDocument(id: string, content: string, expectedEtag: string): Promise<string> {
      const target = resolveDocumentPath(root, id)
      assertNotBlank(id, content)

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
      const target = resolveDocumentPath(root, id)
      assertNotBlank(id, content)

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
      const target = resolveFolderPath(root, folderPath)
      assertNotBlank(folderPath, indexContent)

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

    async createUpload(directory: string, filename: string, bytes: Uint8Array): Promise<string> {
      const entryPath = joinEntryPath(directory, filename)
      assertNormalisedName(entryPath)
      const target = resolveEntryPath(root, entryPath, UPLOAD_EXTENSIONS)

      if (bytes.length === EMPTY) throw new EmptyContentError(entryPath)
      if (!contentMatchesExtension(entryPath, bytes)) {
        throw new ContentMismatchError(entryPath, detectedFormat(bytes))
      }

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
      const target = resolveEntryPath(root, entryPath, UPLOAD_EXTENSIONS)
      await assertResolvesInsideRoot(root, entryPath, target)

      try {
        // Copied out of the Buffer that readFile returns, whose backing store is
        // a shared pool slice rather than an ArrayBuffer of its own.
        return new Uint8Array(await fs.readFile(target))
      } catch (error) {
        throw asDocumentError(entryPath, error, ABSENT_ON_READ_CODES)
      }
    },

    async archive(subtree: string, limits: ArchiveLimits): Promise<ReadableStream<Uint8Array>> {
      return archiveStream(await planArchive(root, subtree, limits))
    },

    async move(request: MoveRequest): Promise<RelinkOutcome> {
      return await lock.run(async () => {
        const before = await documentIdsUnder(root, STORE_ROOT)
        await moveEntry(root, request)

        return await relinkAfterMove(root, before, [{ from: request.from, to: request.to }])
      })
    },

    async trash(entryPath: string): Promise<string> {
      return await lock.run(async () => await moveToTrash(root, entryPath))
    },

    async listTrash(): Promise<TrashEntry[]> {
      return await readTrash(root)
    },

    async trashEntry(entryId: string): Promise<TrashEntryNode> {
      return await readTrashEntry(root, entryId)
    },

    async restore(request: RestoreSelection): Promise<RestoreOutcome> {
      return await lock.run(async () => await restoreSelection(root, request))
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
