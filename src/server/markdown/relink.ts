'use sanity'

import path from 'node:path'

import { rewriteLinkDestinations } from './links.ts'

export interface PathMove {
  from: string
  to: string
}

interface Reading {
  pathPart: string
  suffix: string
}

const NOT_A_STORE_PATH = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/)/u
const SUFFIX_START = /[#?]/u
const EXPLICITLY_RELATIVE = './'

export function movedPath(moves: readonly PathMove[], entryPath: string): string {
  for (const { from, to } of moves) {
    if (entryPath === from) return to
    if (entryPath.startsWith(`${from}/`)) return `${to}${entryPath.slice(from.length)}`
  }

  return entryPath
}

function directoryOf(entryPath: string): string {
  const cut = entryPath.lastIndexOf('/')

  return cut === -1 ? '' : entryPath.slice(0, cut)
}

function resolveWithin(directory: string, destination: string): string | null {
  const segments = directory === '' ? [] : directory.split('/')

  for (const segment of destination.split('/')) {
    if (segment === '' || segment === '.') continue

    if (segment !== '..') {
      segments.push(segment)
      continue
    }

    if (segments.length === 0) return null
    segments.pop()
  }

  return segments.join('/')
}

function expressRelative(writtenPath: string, directory: string, target: string): string {
  const relative = path.posix.relative(`/${directory}`, `/${target}`)
  if (relative === '') return '.'

  const keepPrefix = writtenPath.startsWith(EXPLICITLY_RELATIVE) && !relative.startsWith('.')

  return keepPrefix ? `${EXPLICITLY_RELATIVE}${relative}` : relative
}

function asWholeName(destination: string): Reading {
  return { pathPart: destination, suffix: '' }
}

function asUrlWithSuffix(destination: string, suffixAt: number): Reading {
  return { pathPart: destination.slice(0, suffixAt), suffix: destination.slice(suffixAt) }
}

function readingsInPrecedenceOrder(destination: string): Reading[] {
  const suffix = SUFFIX_START.exec(destination)
  if (suffix === null) return [asWholeName(destination)]

  return [asWholeName(destination), asUrlWithSuffix(destination, suffix.index)]
}

function relinkDestination(
  destination: string,
  oldDirectory: string,
  newDirectory: string,
  moves: readonly PathMove[],
): string {
  if (NOT_A_STORE_PATH.test(destination)) return destination

  let rebased: string | null = null

  for (const { pathPart, suffix } of readingsInPrecedenceOrder(destination)) {
    if (pathPart === '') continue

    const oldTarget = resolveWithin(oldDirectory, pathPart)
    if (oldTarget === null) continue

    const newTarget = movedPath(moves, oldTarget)
    const rewritten = expressRelative(pathPart, newDirectory, newTarget) + suffix

    if (newTarget !== oldTarget) return rewritten
    rebased = rewritten
  }

  if (oldDirectory === newDirectory) return destination

  return rebased ?? destination
}

export function relinkDocument(markdown: string, holderPath: string, moves: readonly PathMove[]): string {
  const oldDirectory = directoryOf(holderPath)
  const newDirectory = directoryOf(movedPath(moves, holderPath))

  return rewriteLinkDestinations(markdown, (destination) =>
    relinkDestination(destination, oldDirectory, newDirectory, moves),
  )
}
