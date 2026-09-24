'use sanity'

import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'

import { archiveStream, planArchive, type ArchiveLimits } from './archive.ts'
import { createFileAtomic, replaceFileAtomic } from './atomic-write.ts'
import { isAtOrInside, nullWhenAbsent, realpathOrNull } from './containment.ts'
import { etagOf } from './etag.ts'
import { createWriteLock, type WriteLock } from './lock.ts'
import { moveEntry, type MoveRequest } from './move.ts'
import { relinkAfterMove, type RelinkOutcome } from './relink-store.ts'
import {
  assertNormalisedName,
  InvalidPathError,
  isAllowedName,
  joinEntryPath,
  resolveDocumentPath,
  resolveEntryPath,
  resolveFolderPath,
  UPLOAD_EXTENSIONS,
} from './safe-path.ts'
import { contentMatchesExtension } from './signatures.ts'
import {
  ABSENT_ON_READ_CODES,
  asDocumentError,
  asExistsError,
  ConcurrentModificationError,
  ContentMismatchError,
  EmptyContentError,
} from './store-errors.ts'
import { classifyFile, readTree, type TreeEntry } from './tree.ts'
import { moveToTrash, purgeFromTrash, readTrash, restoreFromTrash, type TrashEntry } from './trash.ts'

const logStore = createLogger('storage/fs-store')
const logEscape = createLogger('storage/fs-store', 'symlinkEscape')

export interface DocumentStore {
  list: () => Promise<string[]>
  tree: () => Promise<TreeEntry[]>
  read: (id: string) => Promise<string>
  createDocument: (id: string, content: string) => Promise<string>
  createFolder: (folderPath: string, indexContent: string) => Promise<string>
  createUpload: (directory: string, filename: string, bytes: Uint8Array) => Promise<string>
  readBytes: (entryPath: string) => Promise<Uint8Array<ArrayBuffer>>
  updateDocument: (id: string, content: string, expectedEtag: string) => Promise<string>
  archive: (subtree: string, limits: ArchiveLimits) => Promise<ReadableStream>
  move: (request: MoveRequest) => Promise<RelinkOutcome>
  trash: (entryPath: string) => Promise<string>
  listTrash: () => Promise<TrashEntry[]>
  restore: (entryId: string) => Promise<string>
  purge: (entryId: string) => Promise<void>
}

export const FOLDER_INDEX_NAME = 'index.md'

// Long enough that ordinary contention resolves as latency, short enough that a
// genuinely stuck write reports rather than leaving the session looking wedged.
export const WRITE_LOCK_TIMEOUT_MS = 5000

function assertNotBlank(id: string, content: string): void {
  if (content.trim() === '') throw new EmptyContentError(id)
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

async function readdirOrNull(dir: string): Promise<Dirent[] | null> {
  return await nullWhenAbsent(async () => await fs.readdir(dir, { withFileTypes: true }))
}

function isDocumentFile(entry: Dirent): boolean {
  return entry.isFile() && classifyFile(entry.name) === 'document'
}

async function collectDocumentIds(dir: string, prefix: string, found: string[]): Promise<void> {
  const entries = await readdirOrNull(dir)
  if (entries === null) return

  for (const entry of entries) {
    if (!isAllowedName(entry.name)) continue

    const id = prefix === '' ? entry.name : `${prefix}/${entry.name}`

    if (entry.isDirectory()) {
      /* eslint-disable-next-line no-await-in-loop -- a recursive directory walk is
         inherently sequential, and fanning out with Promise.all would risk
         exhausting file descriptors on a deep document tree for no real gain */
      await collectDocumentIds(path.join(dir, entry.name), id, found)
    } else if (isDocumentFile(entry)) {
      found.push(id)
    }
  }
}

export function createFsDocumentStore(
  docsRoot: string,
  lock: WriteLock = createWriteLock(WRITE_LOCK_TIMEOUT_MS),
): DocumentStore {
  const root = path.resolve(docsRoot)

  return {
    async list(): Promise<string[]> {
      const found: string[] = []
      await collectDocumentIds(root, '', found)
      return found.sort((a, b) => a.localeCompare(b))
    },

    async tree(): Promise<TreeEntry[]> {
      return await readTree(root)
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
        if (etagOf(current) !== expectedEtag) throw new ConcurrentModificationError(id)

        await replaceFileAtomic(target, content)
        logStore('updated %s (%d bytes)', id, content.length)
        return etagOf(content)
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
        return etagOf(content)
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
        return etagOf(indexContent)
      })
    },

    async createUpload(directory: string, filename: string, bytes: Uint8Array): Promise<string> {
      const entryPath = joinEntryPath(directory, filename)
      assertNormalisedName(entryPath)
      const target = resolveEntryPath(root, entryPath, UPLOAD_EXTENSIONS)

      if (bytes.length === 0) throw new EmptyContentError(entryPath)
      if (!contentMatchesExtension(entryPath, bytes)) throw new ContentMismatchError(entryPath)

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

    // Deliberately outside the write lock: a slow client dragging a large
    // download over minutes would otherwise block every save.
    async archive(subtree: string, limits: ArchiveLimits): Promise<ReadableStream> {
      return archiveStream(await planArchive(root, subtree, limits))
    },

    async move(request: MoveRequest): Promise<RelinkOutcome> {
      return await lock.run(async () => {
        const before: string[] = []
        await collectDocumentIds(root, '', before)
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

    async restore(entryId: string): Promise<string> {
      return await lock.run(async () => await restoreFromTrash(root, entryId))
    },

    async purge(entryId: string): Promise<void> {
      await lock.run(async () => {
        await purgeFromTrash(root, entryId)
      })
    },
  }
}
