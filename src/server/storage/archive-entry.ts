'use sanity'

import { extensionOf, UPLOAD_EXTENSIONS } from '../../shared/documents.ts'
import { isAllowedName } from './primitives/safe-path.ts'

type ArchiveEntryKind = 'file' | 'directory' | 'other'

export interface ArchiveEntry {
  name: string | null
  kind: ArchiveEntryKind
  declaredBytes: number
  encrypted: boolean
}

type Verdict = { decision: 'import' } | { decision: 'ignore' } | { decision: 'refuse'; reason: string }

const IMPORT: Verdict = { decision: 'import' }
const IGNORE: Verdict = { decision: 'ignore' }

function refuse(reason: string): Verdict {
  return { decision: 'refuse', reason }
}

function segmentsAreAllowed(name: string): boolean {
  return name.split('/').every(isAllowedName)
}

function isNormalised(name: string): boolean {
  return name.normalize('NFC') === name
}

export function verdictFor({ name, kind, encrypted }: ArchiveEntry): Verdict {
  if (name === null) return refuse('an entry carries a name this archive cannot spell')
  if (kind === 'directory') return IGNORE
  if (kind === 'other') return refuse(`${name} is not a regular file`)
  if (encrypted) return refuse(`${name} is encrypted`)
  if (!segmentsAreAllowed(name) || !isNormalised(name)) return refuse(`${name} is not a name the store accepts`)
  if (!UPLOAD_EXTENSIONS.includes(extensionOf(name))) return refuse(`${name} is not a document or an image`)

  return IMPORT
}
