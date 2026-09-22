'use sanity'

import path from 'node:path'

export class InvalidPathError extends Error {
  override readonly name = 'InvalidPathError'

  constructor(value: string, reason: string) {
    super(`Invalid path ${JSON.stringify(value)}: ${reason}`)
  }
}

export const DOCUMENT_EXTENSIONS: readonly string[] = ['.md', '.txt']
export const IMAGE_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

const ALLOWED_SEGMENT = /^[A-Za-z0-9._-]+$/

function segmentsOf(value: string): string[] {
  return value.split('/')
}

export function extensionOf(value: string): string {
  return path.posix.extname(value).toLowerCase()
}

interface SegmentRule {
  rejects: (value: string) => boolean
  reason: string
}

const SEGMENT_RULES: readonly SegmentRule[] = [
  { rejects: (value) => value.includes('\0'), reason: 'must not contain a null byte' },
  { rejects: (value) => segmentsOf(value).includes(''), reason: 'must not contain an empty path segment' },
  {
    rejects: (value) => segmentsOf(value).some((segment) => segment === '.' || segment === '..'),
    reason: 'must not contain a relative path segment',
  },
  {
    rejects: (value) => segmentsOf(value).some((segment) => segment.startsWith('.')),
    reason: 'must not contain a segment beginning with a dot',
  },
  {
    rejects: (value) => !segmentsOf(value).every((segment) => ALLOWED_SEGMENT.test(segment)),
    reason: 'may only contain letters, digits, dot, underscore and hyphen',
  },
]

function assertValidSegments(value: string): void {
  for (const rule of SEGMENT_RULES) {
    if (rule.rejects(value)) throw new InvalidPathError(value, rule.reason)
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
