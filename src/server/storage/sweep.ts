'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'

import { isTemporaryName } from './atomic-write.ts'
import { nullWhenAbsent } from './containment.ts'

const logSwept = createLogger('storage/sweep')
const logKept = createLogger('storage/sweep', 'kept')

async function sweepDirectory(directory: string, prefix: string, removed: string[]): Promise<void> {
  const entries = await nullWhenAbsent(async () => await fs.readdir(directory, { withFileTypes: true }))
  if (entries === null) return

  for (const entry of entries) {
    const here = path.join(directory, entry.name)
    const entryPath = prefix === '' ? entry.name : `${prefix}/${entry.name}`

    if (entry.isDirectory()) {
      if (isTemporaryName(entry.name)) logKept('%s is a directory, so nothing here wrote it', entryPath)

      /* eslint-disable-next-line no-await-in-loop -- a recursive directory walk
         is inherently sequential, and fanning out would risk exhausting file
         descriptors on a deep tree for no real gain */
      await sweepDirectory(here, entryPath, removed)
      continue
    }

    // isFile is false for a symlink, never true for one it points at.
    if (!entry.isFile() || !isTemporaryName(entry.name)) continue

    /* eslint-disable-next-line no-await-in-loop -- see above */
    await fs.rm(here)
    removed.push(entryPath)
  }
}

export async function sweepTemporaries(docsRoot: string): Promise<string[]> {
  const removed: string[] = []
  await sweepDirectory(path.resolve(docsRoot), '', removed)

  if (removed.length > 0) logSwept('removed %d abandoned temporary file(s)', removed.length)

  return removed.sort((a, b) => a.localeCompare(b))
}
