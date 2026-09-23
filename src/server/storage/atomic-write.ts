'use sanity'

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

// A sibling, because rename and link both fail with EXDEV across filesystems
// and only a sibling is guaranteed to be on the same one.
export function temporaryBeside(target: string): string {
  return path.join(path.dirname(target), `.vixen-${randomUUID()}.tmp`)
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
    await fs.rm(temporary, { force: true })
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
