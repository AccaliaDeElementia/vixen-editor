'use sanity'

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:'])
const AGAINST_SOMEWHERE = 'https://vixen.invalid/'

function schemeOf(destination: string): string | null {
  try {
    return new URL(destination, AGAINST_SOMEWHERE).protocol
  } catch {
    return null
  }
}

export function safeDestination(destination: string): string | null {
  const scheme = schemeOf(destination)
  if (scheme === null) return null

  return SAFE_SCHEMES.has(scheme) ? destination : null
}
