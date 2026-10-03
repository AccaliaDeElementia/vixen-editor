'use sanity'

export const STORE_ROOT = ''

export function joinPath(directory: string, name: string): string {
  return directory === STORE_ROOT ? name : `${directory}/${name}`
}

export function isAtOrUnder(ancestor: string, entryPath: string): boolean {
  if (ancestor === STORE_ROOT) return true

  return entryPath === ancestor || entryPath.startsWith(`${ancestor}/`)
}
