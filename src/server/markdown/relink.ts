'use sanity'

import { SEQUENCE_START } from '../../shared/sequences.ts'
import { movedPath, type PathMove } from '../../shared/store-path.ts'
import { directoryOf, isStorePath, relativeDestination, resolveDestination } from '../../shared/link-paths.ts'

import { rewriteLinkDestinations } from './links.ts'

interface Reading {
  pathPart: string
  suffix: string
}

const SUFFIX_START = /[#?]/v
const EXPLICITLY_RELATIVE = './'

function expressRelative(writtenPath: string, directory: string, target: string): string {
  const relative = relativeDestination(directory, target)
  if (relative === '') return '.'

  const keepPrefix = writtenPath.startsWith(EXPLICITLY_RELATIVE) && !relative.startsWith('.')

  return keepPrefix ? `${EXPLICITLY_RELATIVE}${relative}` : relative
}

function asWholeName(destination: string): Reading {
  return { pathPart: destination, suffix: '' }
}

function asUrlWithSuffix(destination: string, suffixAt: number): Reading {
  return { pathPart: destination.slice(SEQUENCE_START, suffixAt), suffix: destination.slice(suffixAt) }
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
  if (!isStorePath(destination)) return destination

  let rebased: string | null = null

  for (const { pathPart, suffix } of readingsInPrecedenceOrder(destination)) {
    if (pathPart === '') continue

    const oldTarget = resolveDestination(oldDirectory, pathPart)
    if (oldTarget === null) continue

    const newTarget = movedPath(moves, oldTarget)
    const rewritten = expressRelative(pathPart, newDirectory, newTarget) + suffix

    if (newTarget !== oldTarget) return rewritten
    rebased = rewritten
  }

  if (oldDirectory === newDirectory) return destination

  return rebased ?? destination
}

function relinkDocument(markdown: string, holderPath: string, moves: readonly PathMove[]): string {
  const oldDirectory = directoryOf(holderPath)
  const newDirectory = directoryOf(movedPath(moves, holderPath))

  return rewriteLinkDestinations(markdown, (destination) =>
    relinkDestination(destination, oldDirectory, newDirectory, moves),
  )
}

// CommonMark allows no whitespace between the bracket and what follows it, so
// every form this repairs needs `](` or `]:` written literally and no escaping
// or encoding can produce one without it appearing.
function mayHoldLinks(content: string): boolean {
  return content.includes('](') || content.includes(']:')
}

export function repairLinks(content: string, holder: string, moves: readonly PathMove[]): string | null {
  if (!mayHoldLinks(content)) return null

  const relinked = relinkDocument(content, holder, moves)

  return relinked === content ? null : relinked
}

export const TestOnly = { relinkDocument }
