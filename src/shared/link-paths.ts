'use sanity'

import { EMPTY, NOT_FOUND, SEQUENCE_START } from './sequences.ts'
import { STORE_ROOT } from './store-path.ts'

const ONE_SEGMENT = 1

const ABSOLUTE_OR_SCHEME = /^(?:[a-zA-Z][a-zA-Z0-9+.\-]*:|\/)/v

export function isStorePath(destination: string): boolean {
  return destination !== '' && !ABSOLUTE_OR_SCHEME.test(destination)
}

export function directoryOf(entryPath: string): string {
  const cut = entryPath.lastIndexOf('/')

  return cut === NOT_FOUND ? STORE_ROOT : entryPath.slice(SEQUENCE_START, cut)
}

export function relativeDestination(fromDirectory: string, target: string): string {
  const from = fromDirectory === STORE_ROOT ? [] : fromDirectory.split('/')
  const to = target === STORE_ROOT ? [] : target.split('/')

  let shared = SEQUENCE_START
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += ONE_SEGMENT

  const upwards = Array.from({ length: from.length - shared }, () => '..')

  return [...upwards, ...to.slice(shared)].join('/')
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
