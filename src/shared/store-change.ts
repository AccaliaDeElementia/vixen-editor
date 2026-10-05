'use sanity'

import { isRecord } from './guards.ts'
import { isAtOrUnder } from './store-path.ts'

interface PathChanged {
  kind: 'written' | 'removed'
  path: string
}

interface PathMoved {
  kind: 'moved'
  from: string
  to: string
}

export type StoreChange = PathChanged | PathMoved

export function isStoreChange(value: unknown): value is StoreChange {
  if (!isRecord(value)) return false

  const { kind } = value
  if (kind === 'moved') return typeof value.from === 'string' && typeof value.to === 'string'

  return (kind === 'written' || kind === 'removed') && typeof value.path === 'string'
}

export function changeTouches(change: StoreChange, entryPath: string): boolean {
  if (change.kind === 'moved') return isAtOrUnder(change.from, entryPath) || isAtOrUnder(change.to, entryPath)

  return isAtOrUnder(change.path, entryPath)
}
