'use sanity'

export const STORE_ROOT = ''

export interface PathMove {
  from: string
  to: string
}

export function movedPath(moves: readonly PathMove[], entryPath: string): string {
  for (const { from, to } of moves) {
    if (entryPath === from) return to
    if (entryPath.startsWith(`${from}/`)) return `${to}${entryPath.slice(from.length)}`
  }

  return entryPath
}

export function joinPath(directory: string, name: string): string {
  return directory === STORE_ROOT ? name : `${directory}/${name}`
}

export function isAtOrUnder(ancestor: string, entryPath: string): boolean {
  if (ancestor === STORE_ROOT) return true

  return entryPath === ancestor || entryPath.startsWith(`${ancestor}/`)
}

function segmentsOf(entryPath: string): string[] {
  return entryPath === STORE_ROOT ? [] : entryPath.split('/')
}

function sharedHead(a: readonly string[], b: readonly string[]): string[] {
  const shared: string[] = []

  for (const [at, segment] of a.entries()) {
    if (b[at] !== segment) break
    shared.push(segment)
  }

  return shared
}

export function deepestSharedFolder(paths: readonly string[]): string {
  const [first, ...rest] = paths.map(segmentsOf)
  if (first === undefined) return STORE_ROOT

  return rest.reduce(sharedHead, first).join('/')
}
