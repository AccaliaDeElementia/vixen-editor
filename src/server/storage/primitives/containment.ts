'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { nullWhenAbsent } from './absence.ts'

export function isAtOrInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep)
}

export async function realpathOrNull(target: string): Promise<string | null> {
  return await nullWhenAbsent(async () => await fs.realpath(target))
}
