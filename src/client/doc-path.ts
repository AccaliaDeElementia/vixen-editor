'use sanity'

export const DOC_PREFIX = '/doc/'
export const FOLDER_INDEX = 'index.md'

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function documentIdFromPath(pathname: string): string {
  const rest = pathname.startsWith(DOC_PREFIX) ? pathname.slice(DOC_PREFIX.length) : ''
  const decoded = rest.split('/').map(decodeSegment).join('/')

  return decoded === '' || decoded.endsWith('/') ? `${decoded}${FOLDER_INDEX}` : decoded
}

export function docUrlFor(entryPath: string): string {
  return `${DOC_PREFIX}${entryPath.split('/').map(encodeURIComponent).join('/')}`
}
