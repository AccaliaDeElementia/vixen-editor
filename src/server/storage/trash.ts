'use sanity'

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'

import { nullWhenAbsent } from './containment.ts'
import { InvalidPathError, resolveFolderPath } from './safe-path.ts'
import { asDocumentError, DocumentNotFoundError, EntryExistsError } from './store-errors.ts'
import { classifyFile, type FileKind } from './tree.ts'

const logTrash = createLogger('storage/trash')
const logDamaged = createLogger('storage/trash', 'damagedEntry')

export const TRASH_DIRECTORY = '.trash'
export const TRASH_META_NAME = 'meta.json'

// A fixed name rather than the original one: a folder may legitimately be
// called `meta.json`, and storing it under its own name would then collide
// with the metadata sitting beside it.
export const TRASH_PAYLOAD_NAME = 'payload'

const TRASH_ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ABSENT_CODES = ['ENOENT', 'ENOTDIR'] as const

export type TrashKind = FileKind | 'folder'

export interface TrashEntry {
  id: string
  originalPath: string
  deletedAt: string
  kind: TrashKind
}

// Timestamps are millisecond-resolution, so a burst of deletes can tie. The id
// breaks the tie only to keep the order stable between requests; within a tie
// it carries no meaning.
function newestFirst(a: TrashEntry, b: TrashEntry): number {
  const byTime = b.deletedAt.localeCompare(a.deletedAt)

  return byTime === 0 ? a.id.localeCompare(b.id) : byTime
}

function trashRoot(root: string): string {
  return path.join(root, TRASH_DIRECTORY)
}

function entryDirectory(root: string, entryId: string): string {
  if (!TRASH_ENTRY_ID.test(entryId)) throw new InvalidPathError(entryId, 'is not a trash entry id')

  return path.join(trashRoot(root), entryId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTrashEntry(value: unknown): value is Omit<TrashEntry, 'id'> {
  if (!isRecord(value)) return false

  return (
    typeof value.originalPath === 'string' &&
    typeof value.deletedAt === 'string' &&
    (value.kind === 'folder' || value.kind === 'document' || value.kind === 'image')
  )
}

async function readMeta(root: string, entryId: string): Promise<Omit<TrashEntry, 'id'> | null> {
  const raw = await nullWhenAbsent(
    async () => await fs.readFile(path.join(entryDirectory(root, entryId), TRASH_META_NAME), 'utf8'),
  )
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    return isTrashEntry(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function entryKindOf(entryPath: string, target: string): Promise<TrashKind> {
  const stats = await nullWhenAbsent(async () => await fs.stat(target))
  if (stats === null) throw new DocumentNotFoundError(entryPath)
  if (stats.isDirectory()) return 'folder'

  const kind = classifyFile(path.basename(entryPath))
  if (kind === null) throw new InvalidPathError(entryPath, 'is not a document, image or folder')

  return kind
}

export async function moveToTrash(root: string, entryPath: string): Promise<string> {
  if (entryPath === '') throw new InvalidPathError(entryPath, 'must not be the document root')

  const target = resolveFolderPath(root, entryPath)
  const kind = await entryKindOf(entryPath, target)

  const id = randomUUID()
  const directory = entryDirectory(root, id)
  await fs.mkdir(directory, { recursive: true })

  const meta = { originalPath: entryPath, deletedAt: new Date().toISOString(), kind }
  await fs.writeFile(path.join(directory, TRASH_META_NAME), JSON.stringify(meta), 'utf8')
  await fs.rename(target, path.join(directory, TRASH_PAYLOAD_NAME))

  logTrash('trashed %s as %s', entryPath, id)
  return id
}

export async function readTrash(root: string): Promise<TrashEntry[]> {
  const ids = await nullWhenAbsent(async () => await fs.readdir(trashRoot(root)))
  if (ids === null) return []

  const entries = await Promise.all(
    ids.filter((id) => TRASH_ENTRY_ID.test(id)).map(async (id) => ({ id, meta: await readMeta(root, id) })),
  )

  return entries
    .flatMap(({ id, meta }) => {
      if (meta === null) {
        logDamaged('skipped %s: metadata missing or unreadable', id)
        return []
      }

      return [{ id, ...meta }]
    })
    .sort(newestFirst)
}

export async function restoreFromTrash(root: string, entryId: string): Promise<string> {
  const directory = entryDirectory(root, entryId)
  const meta = await readMeta(root, entryId)
  if (meta === null) throw new DocumentNotFoundError(entryId)

  const destination = resolveFolderPath(root, meta.originalPath)
  const occupant = await nullWhenAbsent(async () => await fs.stat(destination))
  if (occupant !== null) throw new EntryExistsError(meta.originalPath)

  await fs.mkdir(path.dirname(destination), { recursive: true })

  try {
    await fs.rename(path.join(directory, TRASH_PAYLOAD_NAME), destination)
  } catch (error) {
    throw asDocumentError(entryId, error, ABSENT_CODES)
  }

  await fs.rm(directory, { recursive: true, force: true })
  logTrash('restored %s to %s', entryId, meta.originalPath)

  return meta.originalPath
}

export async function purgeFromTrash(root: string, entryId: string): Promise<void> {
  const directory = entryDirectory(root, entryId)
  const meta = await readMeta(root, entryId)
  if (meta === null) throw new DocumentNotFoundError(entryId)

  await fs.rm(directory, { recursive: true, force: true })
  logTrash('purged %s', entryId)
}
