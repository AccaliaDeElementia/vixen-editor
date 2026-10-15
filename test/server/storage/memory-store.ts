'use sanity'

import { computeEtag } from '../../../src/server/storage/primitives/etag.ts'
import { assertNormalisedName, resolveStorePath } from '../../../src/server/storage/primitives/safe-path.ts'
import {
  ConcurrentModificationError,
  DocumentNotFoundError,
  EntryExistsError,
} from '../../../src/server/storage/primitives/store-errors.ts'
import type { StoreLayer } from '../../../src/server/storage/fs-store.ts'
import type { NameComparator } from '../../../src/server/storage/primitives/name-order.ts'
import type { TreeEntry } from '../../../src/server/storage/tree.ts'
import { classifyFile, FOLDER_INDEX_NAME, type FileKind } from '../../../src/shared/documents.ts'
import { DOCUMENT_EXTENSIONS } from '../../../src/shared/documents.ts'
import { joinPath, STORE_ROOT } from '../../../src/shared/store-path.ts'

const ROOT = '/memory'
const UNDER_ROOT = `${ROOT}/`
const NOT_YET_MODELLED = 'the in-memory store models the document lifecycle only'

interface Held {
  bytes: Uint8Array
  modified: string
}

function textOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function bytesOf(content: string): Uint8Array {
  return new TextEncoder().encode(content)
}

function isDocument(entryPath: string): boolean {
  return DOCUMENT_EXTENSIONS.some((extension) => entryPath.endsWith(extension))
}

function foldersFirstThen(byName: NameComparator): (a: TreeEntry, b: TreeEntry) => number {
  return (a, b) => {
    if (a.kind === 'folder' && b.kind !== 'folder') return -1
    if (a.kind !== 'folder' && b.kind === 'folder') return 1

    return byName(a.name, b.name)
  }
}

export function createMemoryStore(): StoreLayer {
  const held = new Map<string, Held>()

  function at(entryPath: string): string {
    return resolveStorePath(ROOT, entryPath)
  }

  function storePathsHeld(): string[] {
    return [...held.keys()].map((key) => key.slice(UNDER_ROOT.length))
  }

  function isFolder(entryPath: string): boolean {
    return storePathsHeld().some((candidate) => candidate.startsWith(`${entryPath}/`))
  }

  function taken(entryPath: string): boolean {
    return held.has(at(entryPath)) || isFolder(entryPath)
  }

  function place(entryPath: string, bytes: Uint8Array): void {
    held.set(at(entryPath), { bytes, modified: new Date().toISOString() })
  }

  function readHeld(entryPath: string): Held {
    const found = held.get(at(entryPath))
    if (found === undefined) throw new DocumentNotFoundError(entryPath)

    return found
  }

  function treeUnder(prefix: string, byName: NameComparator): TreeEntry[] {
    const within = storePathsHeld().filter((candidate) =>
      prefix === STORE_ROOT ? true : candidate.startsWith(`${prefix}/`),
    )
    const names = new Set(
      within.map((candidate) => candidate.slice(prefix === STORE_ROOT ? 0 : prefix.length + 1).split('/')[0] ?? ''),
    )

    return [...names]
      .map((name) => {
        const entryPath = joinPath(prefix, name)
        const found = held.get(at(entryPath))
        if (found === undefined) {
          return { name, path: entryPath, kind: 'folder' as const, children: treeUnder(entryPath, byName) }
        }
        const kind: FileKind = classifyFile(name) ?? 'document'

        return { name, path: entryPath, kind, size: found.bytes.length, modified: found.modified }
      })
      .sort(foldersFirstThen(byName))
  }

  async function refuse(): Promise<never> {
    return await Promise.reject(new Error(NOT_YET_MODELLED))
  }

  return {
    list: async (byName: NameComparator) => await Promise.resolve(storePathsHeld().filter(isDocument).sort(byName)),

    tree: async (byName: NameComparator) => await Promise.resolve(treeUnder(STORE_ROOT, byName)),

    read: async (id: string) => await Promise.resolve(textOf(readHeld(id).bytes)),

    readBytes: async (entryPath: string) => await Promise.resolve(new Uint8Array(readHeld(entryPath).bytes)),

    createDocument: async (id: string, content: string) => {
      assertNormalisedName(id)
      if (taken(id)) throw new EntryExistsError(id)
      place(id, bytesOf(content))

      return await Promise.resolve(computeEtag(content))
    },

    updateDocument: async (id: string, content: string, expectedEtag: string) => {
      const current = textOf(readHeld(id).bytes)
      if (computeEtag(current) !== expectedEtag) throw new ConcurrentModificationError(id)
      place(id, bytesOf(content))

      return await Promise.resolve(computeEtag(content))
    },

    createFolder: async (folderPath: string, indexContent: string) => {
      assertNormalisedName(folderPath)
      if (taken(folderPath)) throw new EntryExistsError(folderPath)
      place(joinPath(folderPath, FOLDER_INDEX_NAME), bytesOf(indexContent))

      return await Promise.resolve(computeEtag(indexContent))
    },

    createUpload: async (directory: string, filename: string, bytes: Uint8Array) => {
      const entryPath = joinPath(directory, filename)
      assertNormalisedName(entryPath)
      if (taken(entryPath)) throw new EntryExistsError(entryPath)
      place(entryPath, bytes)

      return await Promise.resolve(entryPath)
    },

    archive: refuse,
    move: refuse,
    trash: refuse,
    listTrash: refuse,
    trashEntry: refuse,
    restore: refuse,
    purge: refuse,
    emptyTrash: refuse,
  }
}
