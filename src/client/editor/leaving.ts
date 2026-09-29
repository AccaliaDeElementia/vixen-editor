'use sanity'

import { DocumentRequestError } from './document-client.ts'
import type { SaveState } from './autosave.ts'

const HTTP_CONFLICT = 412
const HTTP_SERVICE_UNAVAILABLE = 503

const REFUSALS: Readonly<Record<number, string>> = {
  [HTTP_CONFLICT]: 'It changed on disk since it was loaded.',
  [HTTP_SERVICE_UNAVAILABLE]: 'The store is busy and did not accept the save.',
}

const EMPTY_BUFFER = 'Empty documents are not stored.'
const UNREACHABLE = 'The server could not be reached.'

export function describeRefusal(state: SaveState, error: unknown): string | null {
  if (state === 'clean') return null
  if (state === 'empty') return EMPTY_BUFFER
  if (!(error instanceof DocumentRequestError)) return UNREACHABLE

  const { [error.status]: known } = REFUSALS

  return known ?? UNREACHABLE
}
