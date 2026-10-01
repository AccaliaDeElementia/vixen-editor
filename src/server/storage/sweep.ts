'use sanity'

import { EMPTY } from '../../shared/sequences.ts'

import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'
import { compareNames } from './name-order.ts'

import { isTemporaryName } from './atomic-write.ts'
import { nullWhenAbsent } from './containment.ts'
import { serially } from '../../shared/serially.ts'
import { joinPath } from '../../shared/store-path.ts'

const logSwept = createLogger('storage/sweep')
const logKept = createLogger('storage/sweep', 'kept')

async function sweepDirectory(directory: string, prefix: string, removed: string[]): Promise<void> {
  const entries = await nullWhenAbsent(async () => await fs.readdir(directory, { withFileTypes: true }))
  if (entries === null) return

  await serially(entries, async (entry) => {
    const here = path.join(directory, entry.name)
    const entryPath = joinPath(prefix, entry.name)

    if (entry.isDirectory()) {
      if (isTemporaryName(entry.name)) logKept('%s is a directory, so nothing here wrote it', entryPath)

      await sweepDirectory(here, entryPath, removed)
      return
    }

    // isFile is false for a symlink, never true for one it points at.
    if (!entry.isFile() || !isTemporaryName(entry.name)) return

    await fs.rm(here)
    removed.push(entryPath)
  })
}

export async function sweepTemporaries(docsRoot: string): Promise<string[]> {
  const removed: string[] = []
  await sweepDirectory(path.resolve(docsRoot), '', removed)

  if (removed.length > EMPTY) logSwept('removed %d abandoned temporary file(s)', removed.length)

  return removed.sort(compareNames)
}
