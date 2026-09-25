'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import { ZipFile } from 'yazl'

import { createLogger } from '../logging.ts'

import { nullWhenAbsent } from './containment.ts'
import { resolveFolderPath } from './safe-path.ts'
import { ArchiveTooLargeError, DocumentNotFoundError } from './store-errors.ts'
import { readTree, type TreeEntry } from './tree.ts'

const logArchive = createLogger('storage/archive')

export interface ArchiveLimits {
  maxBytes: number
  maxEntries: number
}

interface ArchiveContents {
  files: string[]
  directories: string[]
  totalBytes: number
}

interface ArchivePlan extends ArchiveContents {
  base: string
}

function collect(entries: readonly TreeEntry[]): ArchiveContents {
  const files: string[] = []
  const directories: string[] = []
  let totalBytes = 0

  for (const entry of entries) {
    if (entry.kind !== 'folder') {
      files.push(entry.path)
      totalBytes += entry.size
      continue
    }

    if (entry.children.length === 0) {
      directories.push(entry.path)
      continue
    }

    const nested = collect(entry.children)
    files.push(...nested.files)
    directories.push(...nested.directories)
    totalBytes += nested.totalBytes
  }

  return { files, directories, totalBytes }
}

export async function planArchive(root: string, subtree: string, limits: ArchiveLimits): Promise<ArchivePlan> {
  const base = resolveFolderPath(root, subtree)
  const stats = await nullWhenAbsent(async () => await fs.stat(base))
  if (stats?.isDirectory() !== true) throw new DocumentNotFoundError(subtree)

  const plan: ArchivePlan = { base, ...collect(await readTree(base)) }

  const entries = plan.files.length + plan.directories.length
  if (entries > limits.maxEntries) throw new ArchiveTooLargeError('entries', limits.maxEntries, entries)
  if (plan.totalBytes > limits.maxBytes) throw new ArchiveTooLargeError('bytes', limits.maxBytes, plan.totalBytes)

  logArchive('planned %d entries, %d bytes from %s', entries, plan.totalBytes, subtree)
  return plan
}

export function archiveStream(plan: ArchivePlan): ReadableStream {
  const zip = new ZipFile()

  for (const directory of plan.directories) zip.addEmptyDirectory(directory)
  for (const file of plan.files) zip.addFile(path.join(plan.base, file), file)
  zip.end()

  return Readable.toWeb(zip.outputStream)
}
