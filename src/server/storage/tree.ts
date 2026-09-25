'use sanity'

import type { Dirent, Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'

import { isAtOrInside, nullWhenAbsent } from './containment.ts'
import { DOCUMENT_EXTENSIONS, extensionOf, IMAGE_EXTENSIONS, isAllowedName } from './safe-path.ts'
import type { FileKind } from '../../shared/documents.ts'
import { joinPath } from '../../shared/store-path.ts'

const logEscape = createLogger('storage/tree', 'symlinkEscape')
const logCycle = createLogger('storage/tree', 'symlinkCycle')

export interface FolderEntry {
  name: string
  path: string
  kind: 'folder'
  children: TreeEntry[]
}

interface FileEntry {
  name: string
  path: string
  kind: FileKind
  size: number
  modified: string
}

export type TreeEntry = FolderEntry | FileEntry

export function classifyFile(name: string): FileKind | null {
  const extension = extensionOf(name)
  if (DOCUMENT_EXTENSIONS.includes(extension)) return 'document'
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image'

  return null
}

const FOLDER_RANK = 0
const FILE_RANK = 1
const SORT_EQUAL = 0

const FOLDERS_FIRST: Record<TreeEntry['kind'], number> = { folder: FOLDER_RANK, document: FILE_RANK, image: FILE_RANK }

function compareEntries(a: TreeEntry, b: TreeEntry): number {
  const byKind = FOLDERS_FIRST[a.kind] - FOLDERS_FIRST[b.kind]

  return byKind === SORT_EQUAL ? a.name.localeCompare(b.name) : byKind
}

interface WalkScope {
  realRoot: string
  realDir: string
  ancestors: ReadonlySet<string>
}

interface Location {
  dir: string
  prefix: string
  scope: WalkScope
}

async function statOrNull(target: string): Promise<Stats | null> {
  return await nullWhenAbsent(async () => await fs.stat(target))
}

function buildFile(name: string, entryPath: string, stats: Stats): FileEntry | null {
  const kind = classifyFile(name)
  if (kind === null || !stats.isFile()) return null

  return { name, path: entryPath, kind, size: stats.size, modified: stats.mtime.toISOString() }
}

interface FolderLocation {
  name: string
  target: string
  entryPath: string
  real: string
  scope: WalkScope
}

async function buildFolder(at: FolderLocation): Promise<FolderEntry | null> {
  if (at.scope.ancestors.has(at.real)) {
    logCycle('omitted %s: %s is already open on the walk', at.target, at.real)
    return null
  }

  const scope: WalkScope = {
    realRoot: at.scope.realRoot,
    realDir: at.real,
    ancestors: new Set([...at.scope.ancestors, at.real]),
  }
  const children = await walkDirectory(at.target, at.entryPath, scope)

  if (children === null) return null

  return { name: at.name, path: at.entryPath, kind: 'folder', children }
}

async function buildEntry(entry: Dirent, at: Location): Promise<TreeEntry | null> {
  const target = path.join(at.dir, entry.name)

  const stats = await statOrNull(target)
  if (stats === null) return null

  const real = entry.isSymbolicLink() ? await fs.realpath(target) : path.join(at.scope.realDir, entry.name)
  if (!isAtOrInside(at.scope.realRoot, real)) {
    logEscape('omitted %s: resolves to %s, outside %s', target, real, at.scope.realRoot)
    return null
  }

  const { name } = entry
  const entryPath = joinPath(at.prefix, name)

  if (stats.isDirectory()) return await buildFolder({ name, target, entryPath, real, scope: at.scope })

  return buildFile(name, entryPath, stats)
}

async function buildEntries(entries: readonly Dirent[], at: Location): Promise<TreeEntry[]> {
  const found: TreeEntry[] = []

  for (const entry of entries) {
    if (!isAllowedName(entry.name)) continue

    /* eslint-disable-next-line no-await-in-loop -- a recursive directory walk is
       inherently sequential, and fanning out with Promise.all would risk
       exhausting file descriptors on a deep document tree for no real gain */
    const built = await buildEntry(entry, at)
    if (built !== null) found.push(built)
  }

  return found.sort(compareEntries)
}

async function walkDirectory(dir: string, prefix: string, scope: WalkScope): Promise<TreeEntry[] | null> {
  const entries = await nullWhenAbsent(async () => await fs.readdir(dir, { withFileTypes: true }))
  if (entries === null) return null

  return await buildEntries(entries, { dir, prefix, scope })
}

export async function readTree(docsRoot: string): Promise<TreeEntry[]> {
  const root = path.resolve(docsRoot)

  const entries = await nullWhenAbsent(async () => await fs.readdir(root, { withFileTypes: true }))
  if (entries === null) return []

  const realRoot = await fs.realpath(root)

  const scope: WalkScope = { realRoot, realDir: realRoot, ancestors: new Set([realRoot]) }

  return await buildEntries(entries, { dir: root, prefix: '', scope })
}
