'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { ABSENT_CODES, hasErrorCode, toError } from '../errors.ts'

export function isAtOrInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep)
}

export async function nullWhenAbsent<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation()
  } catch (error) {
    if (hasErrorCode(error, ABSENT_CODES)) return null
    throw toError(error)
  }
}

export async function realpathOrNull(target: string): Promise<string | null> {
  return await nullWhenAbsent(async () => await fs.realpath(target))
}
