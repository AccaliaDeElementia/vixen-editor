'use sanity'

export const DOC_PREFIX = '/doc/'
export const TRASH_PREFIX = '/trash/'

export function trashUrlFor(entryId: string): string {
  return `${TRASH_PREFIX}${encodeURIComponent(entryId)}`
}

export function trashEntryIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(TRASH_PREFIX)) return null

  const rest = pathname.slice(TRASH_PREFIX.length)

  return rest === '' ? null : decodeURIComponent(rest)
}
