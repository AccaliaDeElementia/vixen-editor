'use sanity'

import path from 'node:path'

export class InvalidDocumentIdError extends Error {
  override readonly name = 'InvalidDocumentIdError'

  constructor(id: string, reason: string) {
    super(`Invalid document id ${JSON.stringify(id)}: ${reason}`)
  }
}

const ALLOWED_SEGMENT = /^[A-Za-z0-9._-]+$/
const MARKDOWN_EXTENSION = '.md'

function segmentsOf(id: string): string[] {
  return id.split('/')
}

interface DocumentIdRule {
  rejects: (id: string) => boolean
  reason: string
}

const DOCUMENT_ID_RULES: readonly DocumentIdRule[] = [
  { rejects: (id) => id === '', reason: 'must not be empty' },
  { rejects: (id) => id.includes('\0'), reason: 'must not contain a null byte' },
  { rejects: (id) => !id.endsWith(MARKDOWN_EXTENSION), reason: `must end with ${MARKDOWN_EXTENSION}` },
  { rejects: (id) => segmentsOf(id).includes(''), reason: 'must not contain an empty path segment' },
  {
    rejects: (id) => segmentsOf(id).some((segment) => segment === '.' || segment === '..'),
    reason: 'must not contain a relative path segment',
  },
  {
    rejects: (id) => !segmentsOf(id).every((segment) => ALLOWED_SEGMENT.test(segment)),
    reason: 'may only contain letters, digits, dot, underscore and hyphen',
  },
  {
    rejects: (id) => path.posix.basename(id) === MARKDOWN_EXTENSION,
    reason: 'must have a name before the extension',
  },
]

function assertValidDocumentId(id: string): void {
  for (const rule of DOCUMENT_ID_RULES) {
    if (rule.rejects(id)) throw new InvalidDocumentIdError(id, rule.reason)
  }
}

export function resolveDocumentPath(docsRoot: string, id: string): string {
  assertValidDocumentId(id)

  const root = path.resolve(docsRoot)
  const resolved = path.resolve(root, id)

  /* v8 ignore start -- unreachable while DOCUMENT_ID_RULES rejects every relative
     segment and every separator other than '/', but containment is the invariant
     this function exists to guarantee, so it is asserted rather than inferred */
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new InvalidDocumentIdError(id, 'resolves outside the document root')
  }
  /* v8 ignore stop */

  return resolved
}
