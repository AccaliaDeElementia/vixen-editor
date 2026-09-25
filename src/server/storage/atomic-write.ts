'use sanity'

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'

const logDiscard = createLogger('storage/atomic-write', 'discard')

const TEMPORARY_PREFIX = '.vixen-'
const TEMPORARY_SUFFIX = '.tmp'

// A sibling, because rename and link both fail with EXDEV across filesystems
// and only a sibling is guaranteed to be on the same one.
function temporaryBeside(target: string): string {
  return path.join(path.dirname(target), `${TEMPORARY_PREFIX}${randomUUID()}${TEMPORARY_SUFFIX}`)
}

export function isTemporaryName(name: string): boolean {
  return (
    name.length > TEMPORARY_PREFIX.length + TEMPORARY_SUFFIX.length &&
    name.startsWith(TEMPORARY_PREFIX) &&
    name.endsWith(TEMPORARY_SUFFIX)
  )
}

async function writeThenSync(target: string, data: string | Uint8Array): Promise<void> {
  const handle = await fs.open(target, 'wx')

  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

// `handle.close` is deliberately not treated this way: on NFS a close is where
// a deferred write error surfaces, so a close that fails is a write that failed.
async function discardIgnoringFailure(temporary: string): Promise<void> {
  try {
    await fs.rm(temporary, { force: true })
  } catch (error) {
    logDiscard('%s: %O', temporary, error)
  }
}

async function throughTemporary(
  target: string,
  data: string | Uint8Array,
  place: (temporary: string) => Promise<void>,
): Promise<void> {
  const temporary = temporaryBeside(target)

  try {
    await writeThenSync(temporary, data)
    await place(temporary)
  } finally {
    await discardIgnoringFailure(temporary)
  }
}

export async function replaceFileAtomic(target: string, data: string | Uint8Array): Promise<void> {
  await throughTemporary(target, data, async (temporary) => {
    await fs.rename(temporary, target)
  })
}

export async function createFileAtomic(target: string, data: string | Uint8Array): Promise<void> {
  await throughTemporary(target, data, async (temporary) => {
    await fs.link(temporary, target)
  })
}

export const TestOnly = { temporaryBeside }
