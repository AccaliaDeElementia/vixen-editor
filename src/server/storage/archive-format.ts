'use sanity'

import { SEQUENCE_START } from '../../shared/sequences.ts'

type ArchiveFormat = 'zip'

const ZIP_LOCAL_FILE = 'PK\u0003\u0004'
const ZIP_EMPTY_DIRECTORY = 'PK\u0005\u0006'
const ZIP_SIGNATURES: readonly Uint8Array[] = [ZIP_LOCAL_FILE, ZIP_EMPTY_DIRECTORY].map((signature) =>
  new TextEncoder().encode(signature),
)

function opensWith(head: Uint8Array, signature: Uint8Array): boolean {
  return signature.every((byte, index) => head[SEQUENCE_START + index] === byte)
}

export function archiveFormatOf(head: Uint8Array): ArchiveFormat | null {
  return ZIP_SIGNATURES.some((signature) => opensWith(head, signature)) ? 'zip' : null
}
