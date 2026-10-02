'use sanity'

import { ABSENT_CODES, hasErrorCode, toError } from '../node-errors.ts'

export async function nullWhenAbsent<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation()
  } catch (error) {
    if (hasErrorCode(error, ABSENT_CODES)) return null
    throw toError(error)
  }
}
