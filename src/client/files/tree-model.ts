'use sanity'

import { isRecord } from '../../shared/guards.ts'
import { isEntryKind, type EntryKind, type FileKind } from '../../shared/documents.ts'

type FolderPath = string

export const STORE_ROOT = ''

interface FileNode {
  name: string
  path: string
  kind: FileKind
}

interface FolderNode {
  name: string
  path: string
  kind: 'folder'
  children: TreeNode[]
}

export type TreeNode = FolderNode | FileNode

export interface TrashNode {
  id: string
  originalPath: string
  kind: EntryKind
  deletedAt: string
}

function parseNode(value: unknown): TreeNode | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.path !== 'string') return null

  if (value.kind === 'folder') {
    return { name: value.name, path: value.path, kind: 'folder', children: parseNodes(value.children) }
  }
  if (value.kind === 'document' || value.kind === 'image') {
    return { name: value.name, path: value.path, kind: value.kind }
  }

  return null
}

function parseNodes(value: unknown): TreeNode[] {
  return Array.isArray(value) ? value.flatMap((entry: unknown) => parseNode(entry) ?? []) : []
}

export function parseTree(payload: unknown): TreeNode[] {
  return isRecord(payload) ? parseNodes(payload.tree) : []
}

function parseTrashNode(value: unknown): TrashNode | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.originalPath !== 'string') return null
  if (typeof value.deletedAt !== 'string' || !isEntryKind(value.kind)) return null

  return { id: value.id, originalPath: value.originalPath, kind: value.kind, deletedAt: value.deletedAt }
}

export function parseTrash(payload: unknown): TrashNode[] {
  if (!isRecord(payload) || !Array.isArray(payload.entries)) return []

  return payload.entries.flatMap((entry: unknown) => parseTrashNode(entry) ?? [])
}

export function parentOf(entryPath: string): string {
  const cut = entryPath.lastIndexOf('/')

  return cut === -1 ? STORE_ROOT : entryPath.slice(0, cut)
}

export function joinPath(directory: string, name: string): string {
  return directory === STORE_ROOT ? name : `${directory}/${name}`
}

export function ancestorsOf(entryPath: string): FolderPath[] {
  const segments = entryPath.split('/')
  segments.pop()

  return segments.map((_segment, index) => segments.slice(0, index + 1).join('/'))
}

export function folderPathsIn(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === 'folder' ? [node.path, ...folderPathsIn(node.children)] : []))
}
