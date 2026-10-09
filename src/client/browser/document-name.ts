'use sanity'

import { DOCUMENT_EXTENSIONS, extensionOf } from '../../shared/documents.ts'

const FORCED_EXTENSION = '.md'

export function documentNameFor(typed: string): string {
  if (typed === '') return typed
  if (DOCUMENT_EXTENSIONS.includes(extensionOf(typed))) return typed

  return `${typed}${FORCED_EXTENSION}`
}
