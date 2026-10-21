'use sanity'

import { SEQUENCE_START } from '../../shared/sequences.ts'

export type ArchiveFormat = 'zip' | 'tar.gz'

const FORMAT = 1
const ZIP_LOCAL_FILE = 'PK\u0003\u0004'
const ZIP_EMPTY_DIRECTORY = 'PK\u0005\u0006'
const GZIP_MEMBER = '\u001f\u008b'

function bytesOf(signature: string): Uint8Array {
  return Uint8Array.from(signature, (character) => character.charCodeAt(SEQUENCE_START))
}

const SIGNATURES: ReadonlyArray<readonly [Uint8Array, ArchiveFormat]> = [
  [bytesOf(ZIP_LOCAL_FILE), 'zip'],
  [bytesOf(ZIP_EMPTY_DIRECTORY), 'zip'],
  [bytesOf(GZIP_MEMBER), 'tar.gz'],
]

function opensWith(head: Uint8Array, signature: Uint8Array): boolean {
  return signature.every((byte, index) => head[SEQUENCE_START + index] === byte)
}

export function archiveFormatOf(head: Uint8Array): ArchiveFormat | null {
  return SIGNATURES.find(([signature]) => opensWith(head, signature))?.[FORMAT] ?? null
}
