'use sanity'

import { isRecord } from '../../shared/guards.ts'
import { pathAfterMove, type EntryMove } from '../doc-path.ts'
import { readJson, writeJson } from '../local-storage.ts'

const CARETS_KEY = 'vixen-editor:carets'
const REMEMBERED_DOCUMENTS = 20
const TOP_OF_DOCUMENT = 0
const MOST_RECENT = 0

interface CaretEntry {
  path: string
  position: number
}

function isCaretEntry(value: unknown): value is CaretEntry {
  if (!isRecord(value)) return false

  return typeof value.path === 'string' && Number.isInteger(value.position) && Number(value.position) >= TOP_OF_DOCUMENT
}

function readEntries(storage?: Storage | null): CaretEntry[] {
  const stored = readJson(CARETS_KEY, storage)

  return Array.isArray(stored) ? stored.filter(isCaretEntry) : []
}

function withAtTheHead(entries: readonly CaretEntry[], entry: CaretEntry): CaretEntry[] {
  const others = entries.filter((candidate) => candidate.path !== entry.path)

  return [entry, ...others].slice(MOST_RECENT, REMEMBERED_DOCUMENTS)
}

export function rememberCaret(entryPath: string, position: number, storage?: Storage | null): void {
  const entry = { path: entryPath, position }

  writeJson(CARETS_KEY, withAtTheHead(readEntries(storage), entry), storage)
}

export function recallCaret(entryPath: string, documentLength: number, storage?: Storage | null): number {
  const entries = readEntries(storage)
  const remembered = entries.find((candidate) => candidate.path === entryPath)
  if (remembered === undefined) return TOP_OF_DOCUMENT

  writeJson(CARETS_KEY, withAtTheHead(entries, remembered), storage)

  return Math.min(remembered.position, documentLength)
}

export function caretsFollowMove(move: EntryMove, storage?: Storage | null): void {
  const moved = readEntries(storage).map((entry) => ({ ...entry, path: pathAfterMove(move, entry.path) }))

  writeJson(CARETS_KEY, moved, storage)
}

export const TestOnly = { CARETS_KEY, REMEMBERED_DOCUMENTS }
