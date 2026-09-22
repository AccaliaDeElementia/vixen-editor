'use sanity'

import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { hasErrorCode, toError } from '../errors.ts'
import { createLogger } from '../logging.ts'

import { isAtOrInside, nullWhenAbsent, realpathOrNull } from './containment.ts'
import { InvalidPathError, resolveDocumentPath, resolveFolderPath } from './safe-path.ts'
import { classifyFile, readTree, type TreeEntry } from './tree.ts'

const logStore = createLogger('storage/fs-store')
const logEscape = createLogger('storage/fs-store', 'symlinkEscape')

export interface DocumentStore {
  list: () => Promise<string[]>
  tree: () => Promise<TreeEntry[]>
  read: (id: string) => Promise<string>
  write: (id: string, content: string) => Promise<void>
  createDocument: (id: string, content: string) => Promise<void>
  createFolder: (folderPath: string, indexContent: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const FOLDER_INDEX_NAME = 'index.md'

const ABSENT_ON_READ_CODES = ['ENOENT', 'ENOTDIR', 'EISDIR'] as const
const OCCUPIED_CODES = ['EEXIST', 'ENOTDIR', 'EISDIR'] as const
const ABSENT_ON_REMOVE_CODES = ['ENOENT', 'ENOTDIR', 'EISDIR', 'EPERM'] as const

export class DocumentNotFoundError extends Error {
  override readonly name = 'DocumentNotFoundError'

  constructor(id: string) {
    super(`Document not found: ${id}`)
  }
}

export class EntryExistsError extends Error {
  override readonly name = 'EntryExistsError'

  constructor(entryPath: string) {
    super(`Already exists: ${entryPath}`)
  }
}

export function asDocumentError(id: string, error: unknown, codes: readonly string[]): Error {
  return hasErrorCode(error, codes) ? new DocumentNotFoundError(id) : toError(error)
}

function asExistsError(entryPath: string, error: unknown): Error {
  return hasErrorCode(error, OCCUPIED_CODES) ? new EntryExistsError(entryPath) : toError(error)
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

function isHidden(entry: Dirent): boolean {
  return entry.name.startsWith('.')
}

function isDocumentFile(entry: Dirent): boolean {
  return entry.isFile() && classifyFile(entry.name) === 'document'
}

async function collectDocumentIds(dir: string, prefix: string, found: string[]): Promise<void> {
  const entries = await readdirOrNull(dir)
  if (entries === null) return

  for (const entry of entries) {
    if (isHidden(entry)) continue

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

export function createFsDocumentStore(docsRoot: string): DocumentStore {
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

      try {
        return await fs.readFile(target, 'utf8')
      } catch (error) {
        throw asDocumentError(id, error, ABSENT_ON_READ_CODES)
      }
    },

    async write(id: string, content: string): Promise<void> {
      const target = resolveDocumentPath(root, id)
      const parent = path.dirname(target)

      await fs.mkdir(parent, { recursive: true })
      await assertResolvesInsideRoot(root, id, parent)
      await fs.writeFile(target, content, 'utf8')
      logStore('wrote %s (%d bytes)', id, content.length)
    },

    async createDocument(id: string, content: string): Promise<void> {
      const target = resolveDocumentPath(root, id)
      const parent = path.dirname(target)

      await fs.mkdir(parent, { recursive: true })
      await assertResolvesInsideRoot(root, id, parent)

      try {
        await fs.writeFile(target, content, { encoding: 'utf8', flag: 'wx' })
      } catch (error) {
        throw asExistsError(id, error)
      }
      logStore('created %s (%d bytes)', id, content.length)
    },

    async createFolder(folderPath: string, indexContent: string): Promise<void> {
      const target = resolveFolderPath(root, folderPath)
      const parent = path.dirname(target)

      await fs.mkdir(parent, { recursive: true })
      await assertResolvesInsideRoot(root, folderPath, parent)

      try {
        await fs.mkdir(target)
      } catch (error) {
        throw asExistsError(folderPath, error)
      }
      await fs.writeFile(path.join(target, FOLDER_INDEX_NAME), indexContent, { encoding: 'utf8', flag: 'wx' })
      logStore('created folder %s', folderPath)
    },

    async remove(id: string): Promise<void> {
      const target = resolveDocumentPath(root, id)
      await assertResolvesInsideRoot(root, id, target)

      try {
        await fs.unlink(target)
      } catch (error) {
        throw asDocumentError(id, error, ABSENT_ON_REMOVE_CODES)
      }
      logStore('removed %s', id)
    },
  }
}
