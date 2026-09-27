'use sanity'

const ANY_VERSION = '*'
const WEAK_PREFIX = 'W/'

function withoutWeakness(token: string): string {
  return token.startsWith(WEAK_PREFIX) ? token.slice(WEAK_PREFIX.length) : token
}

export function matchesAny(ifNoneMatch: string | undefined, etag: string): boolean {
  if (ifNoneMatch === undefined) return false
  if (ifNoneMatch.trim() === ANY_VERSION) return true

  return ifNoneMatch
    .split(',')
    .map((token) => withoutWeakness(token.trim()))
    .includes(etag)
}
