'use sanity'

import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { nullWhenAbsent } from './absence.ts'
import { isAllowedName } from './safe-path.ts'
import { classifyFile } from '../../shared/documents.ts'
import { serially } from '../../shared/serially.ts'
import { joinPath } from '../../shared/store-path.ts'

function isDocumentFile(entry: Dirent): boolean {
  return entry.isFile() && classifyFile(entry.name) === 'document'
}

async function collect(dir: string, prefix: string, found: string[]): Promise<void> {
  const entries = await nullWhenAbsent(async () => await fs.readdir(dir, { withFileTypes: true }))
  if (entries === null) return

  await serially(entries, async (entry) => {
    if (!isAllowedName(entry.name)) return

    const id = joinPath(prefix, entry.name)

    if (entry.isDirectory()) {
      await collect(path.join(dir, entry.name), id, found)
    } else if (isDocumentFile(entry)) {
      found.push(id)
    }
  })
}

export async function documentIdsUnder(dir: string, prefix: string): Promise<string[]> {
  const found: string[] = []
  await collect(dir, prefix, found)

  return found
}
