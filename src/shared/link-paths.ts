'use sanity'

import { EMPTY, NOT_FOUND, SEQUENCE_START } from './sequences.ts'
import { STORE_ROOT } from './store-path.ts'

const ABSOLUTE_OR_SCHEME = /^(?:[a-zA-Z][a-zA-Z0-9+.\-]*:|\/)/v

export function isStorePath(destination: string): boolean {
  return destination !== '' && !ABSOLUTE_OR_SCHEME.test(destination)
}

export function directoryOf(entryPath: string): string {
  const cut = entryPath.lastIndexOf('/')

  return cut === NOT_FOUND ? STORE_ROOT : entryPath.slice(SEQUENCE_START, cut)
}

export function resolveDestination(directory: string, destination: string): string | null {
  const segments = directory === STORE_ROOT ? [] : directory.split('/')

  for (const segment of destination.split('/')) {
    if (segment === '' || segment === '.') continue

    if (segment !== '..') {
      segments.push(segment)
      continue
    }

    if (segments.length === EMPTY) return null
    segments.pop()
  }

  return segments.join('/')
}
