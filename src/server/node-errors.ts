'use sanity'

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export const ABSENT_CODES = ['ENOENT', 'ENOTDIR'] as const

export function hasErrorCode(error: unknown, codes: readonly string[]): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && codes.includes(error.code)
}
