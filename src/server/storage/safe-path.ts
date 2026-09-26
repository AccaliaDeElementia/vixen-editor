'use sanity'

import path from 'node:path'

import { DOCUMENT_EXTENSIONS, extensionOf } from '../../shared/documents.ts'

import { joinPath } from '../../shared/store-path.ts'

export class InvalidPathError extends Error {
  override readonly name = 'InvalidPathError'

  constructor(value: string, reason: string) {
    super(`Invalid path ${JSON.stringify(value)}: ${reason}`)
  }
}

// NAME_MAX on Linux is 255 *bytes*, not characters: an emoji costs four and a
// CJK character three, so a short-looking name can still exceed it.
const MAX_NAME_BYTES = 255

const CONTROL = /\p{Cc}/v

const INVISIBLE_EXCEPT_JOINER = /(?!\u200D)\p{Cf}/v

// A well-formed emoji ZWJ sequence: pictographs joined through the joiner, with
// skin-tone modifiers and variation selectors allowed between them.
const EMOJI_ZWJ_SEQUENCE =
  /\p{Extended_Pictographic}(?:[\p{Emoji_Modifier}\uFE0F]*\u200D\p{Extended_Pictographic})+[\p{Emoji_Modifier}\uFE0F]*/gv

const ZERO_WIDTH_JOINER = '\u200D'

function segmentsOf(value: string): string[] {
  return value.split('/')
}

function byteLength(name: string): number {
  return new TextEncoder().encode(name).length
}

function hasStrayJoiner(name: string): boolean {
  return name.replace(EMOJI_ZWJ_SEQUENCE, '').includes(ZERO_WIDTH_JOINER)
}

interface NameRule {
  rejects: (name: string) => boolean
  reason: string
}

const NAME_RULES: readonly NameRule[] = [
  { rejects: (name) => name === '', reason: 'must not contain an empty path segment' },
  { rejects: (name) => name === '.' || name === '..', reason: 'must not contain a relative path segment' },
  { rejects: (name) => name.startsWith('.'), reason: 'must not contain a segment beginning with a dot' },
  { rejects: (name) => name.includes('\\'), reason: 'must not contain a backslash' },
  { rejects: (name) => CONTROL.test(name), reason: 'must not contain a control character' },
  {
    rejects: (name) => INVISIBLE_EXCEPT_JOINER.test(name),
    reason: 'must not contain an invisible formatting character',
  },
  { rejects: hasStrayJoiner, reason: 'may only use a zero-width joiner between emoji' },
  { rejects: (name) => name.trim() === '', reason: 'must not be only whitespace' },
  { rejects: (name) => name !== name.trim(), reason: 'must not begin or end with whitespace' },
  { rejects: (name) => byteLength(name) > MAX_NAME_BYTES, reason: `must be at most ${String(MAX_NAME_BYTES)} bytes` },
]

export function isAllowedName(name: string): boolean {
  return !NAME_RULES.some((rule) => rule.rejects(name))
}

function assertValidSegments(value: string): void {
  for (const name of segmentsOf(value)) {
    const broken = NAME_RULES.find((rule) => rule.rejects(name))
    if (broken !== undefined) throw new InvalidPathError(value, broken.reason)
  }
}

export function assertNormalisedName(value: string): void {
  if (value.normalize('NFC') !== value) {
    throw new InvalidPathError(value, 'must be in Unicode normal form NFC')
  }
}

function resolveInsideRoot(docsRoot: string, value: string): string {
  const root = path.resolve(docsRoot)
  const resolved = path.resolve(root, value)

  /* v8 ignore start -- unreachable while SEGMENT_RULES rejects every relative
     segment and every separator other than '/', but containment is the invariant
     these functions exist to guarantee, so it is asserted rather than inferred */
  if (!(resolved === root || resolved.startsWith(root + path.sep))) {
    throw new InvalidPathError(value, 'resolves outside the document root')
  }
  /* v8 ignore stop */

  return resolved
}

export function resolveEntryPath(docsRoot: string, id: string, allowedExtensions: readonly string[]): string {
  if (id === '') throw new InvalidPathError(id, 'must not be empty')

  assertValidSegments(id)

  if (!allowedExtensions.includes(extensionOf(id))) {
    throw new InvalidPathError(id, `must end with one of ${allowedExtensions.join(', ')}`)
  }

  return resolveInsideRoot(docsRoot, id)
}

export function resolveDocumentPath(docsRoot: string, id: string): string {
  return resolveEntryPath(docsRoot, id, DOCUMENT_EXTENSIONS)
}

export function resolveFolderPath(docsRoot: string, folderPath: string): string {
  if (folderPath !== '') assertValidSegments(folderPath)

  return resolveInsideRoot(docsRoot, folderPath)
}

export function joinEntryPath(directory: string, name: string): string {
  if (name.includes('/')) throw new InvalidPathError(name, 'must be a single path segment')

  return joinPath(directory, name)
}

export const TestOnly = { NAME_RULES }
