'use sanity'

import { hasErrorCode, toError } from '../errors.ts'

export const ABSENT_ON_READ_CODES = ['ENOENT', 'ENOTDIR', 'EISDIR'] as const
export const OCCUPIED_CODES = ['EEXIST', 'ENOTDIR', 'EISDIR'] as const

export class DocumentNotFoundError extends Error {
  override readonly name = 'DocumentNotFoundError'

  constructor(id: string) {
    super(`Document not found: ${id}`)
  }
}

export class ConcurrentModificationError extends Error {
  override readonly name = 'ConcurrentModificationError'

  constructor(id: string) {
    super(`Document changed since it was loaded: ${id}`)
  }
}

export class ContentMismatchError extends Error {
  override readonly name = 'ContentMismatchError'

  constructor(entryPath: string) {
    super(`Content does not match the extension: ${entryPath}`)
  }
}

export class EmptyContentError extends Error {
  override readonly name = 'EmptyContentError'

  constructor(id: string) {
    super(`Refusing to store empty content: ${id}`)
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

export function asExistsError(entryPath: string, error: unknown): Error {
  return hasErrorCode(error, OCCUPIED_CODES) ? new EntryExistsError(entryPath) : toError(error)
}

export class InvalidMoveError extends Error {
  override readonly name = 'InvalidMoveError'

  constructor(from: string, to: string) {
    super(`Cannot move ${from} into its own descendant ${to}`)
  }
}

export class WouldOverwriteError extends Error {
  override readonly name = 'WouldOverwriteError'
  readonly paths: readonly string[]

  constructor(paths: readonly string[]) {
    super(`Would overwrite ${String(paths.length)} existing path(s)`)
    this.paths = paths
  }
}

export class ArchiveTooLargeError extends Error {
  override readonly name = 'ArchiveTooLargeError'
  readonly unit: string
  readonly limit: number
  readonly measured: number

  constructor(unit: string, limit: number, measured: number) {
    super(`Archive of ${String(measured)} ${unit} exceeds the limit of ${String(limit)}`)
    this.unit = unit
    this.limit = limit
    this.measured = measured
  }
}
