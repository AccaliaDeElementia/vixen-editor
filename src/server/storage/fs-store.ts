'use sanity'

import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { toError } from '../errors.ts'
import { createLogger } from '../logging.ts'

import { InvalidDocumentIdError, resolveDocumentPath } from './safe-path.ts'

const logStore = createLogger('storage/fs-store')
const logEscape = createLogger('storage/fs-store', 'symlinkEscape')

export interface DocumentStore {
  list: () => Promise<string[]>
  read: (id: string) => Promise<string>
  write: (id: string, content: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

const MARKDOWN_EXTENSION = '.md'

const ABSENT_CODES = ['ENOENT', 'ENOTDIR'] as const
const ABSENT_ON_READ_CODES = ['ENOENT', 'ENOTDIR', 'EISDIR'] as const
const ABSENT_ON_REMOVE_CODES = ['ENOENT', 'ENOTDIR', 'EISDIR', 'EPERM'] as const

export class DocumentNotFoundError extends Error {
  override readonly name = 'DocumentNotFoundError'

  constructor(id: string) {
    super(`Document not found: ${id}`)
  }
}

export function hasErrorCode(error: unknown, codes: readonly string[]): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && codes.includes(error.code)
}

export function asDocumentError(id: string, error: unknown, codes: readonly string[]): Error {
  return hasErrorCode(error, codes) ? new DocumentNotFoundError(id) : toError(error)
}

function isAtOrInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep)
}

async function realpathOrNull(target: string): Promise<string | null> {
  try {
    return await fs.realpath(target)
  } catch (error) {
    if (hasErrorCode(error, ABSENT_CODES)) return null
    throw toError(error)
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
    throw new InvalidDocumentIdError(id, 'resolves outside the document root')
  }
}

async function readdirOrNull(dir: string): Promise<Dirent[] | null> {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (hasErrorCode(error, ABSENT_CODES)) return null
    throw toError(error)
  }
}

function isHidden(entry: Dirent): boolean {
  return entry.name.startsWith('.')
}

function isMarkdownFile(entry: Dirent): boolean {
  return entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION)
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
    } else if (isMarkdownFile(entry)) {
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
