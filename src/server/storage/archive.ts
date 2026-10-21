'use sanity'

import { EMPTY } from '../../shared/sequences.ts'
import { serially } from '../../shared/serially.ts'

import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import { ZipFile } from 'yazl'
import { createTarPacker, type TarHeader, type TarPackController } from 'modern-tar'

import { createLogger } from '../platform/logging.ts'
import { toError } from '../platform/node-errors.ts'

import { nullWhenAbsent } from './primitives/absence.ts'
import { resolveStorePath } from './primitives/safe-path.ts'
import { ArchiveTooLargeError, DocumentNotFoundError } from './primitives/store-errors.ts'
import { compareNames } from './primitives/name-order.ts'
import { readTree, type TreeEntry } from './tree.ts'
import type { ArchiveFormat } from './archive-format.ts'

const logArchive = createLogger('storage/archive')

interface ArchiveLimits {
  maxBytes: number
  maxEntries: number
}

export interface ArchiveRequest extends ArchiveLimits {
  format: ArchiveFormat
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

    if (entry.children.length === EMPTY) {
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
  const base = resolveStorePath(root, subtree)
  const stats = await nullWhenAbsent(async () => await fs.stat(base))
  if (stats?.isDirectory() !== true) throw new DocumentNotFoundError(subtree)

  const plan: ArchivePlan = { base, ...collect(await readTree(base, compareNames)) }

  const entries = plan.files.length + plan.directories.length
  if (entries > limits.maxEntries) throw new ArchiveTooLargeError('entries', limits.maxEntries, entries)
  if (plan.totalBytes > limits.maxBytes) throw new ArchiveTooLargeError('bytes', limits.maxBytes, plan.totalBytes)

  logArchive('planned %d entries, %d bytes from %s', entries, plan.totalBytes, subtree)
  return plan
}

function zipStream(plan: ArchivePlan): ReadableStream<Uint8Array> {
  const zip = new ZipFile()

  zip.on('error', (error: Error) => {
    logArchive('aborted: %s', error.message)
    zip.outputStream.emit('error', error)
  })

  for (const directory of plan.directories) zip.addEmptyDirectory(directory)
  for (const file of plan.files) zip.addFile(path.join(plan.base, file), file)
  zip.end()

  return Readable.toWeb(zip.outputStream)
}

const NO_OWNER_ID = 0
const NO_OWNER_NAME = ''
const UNOWNED = { uid: NO_OWNER_ID, gid: NO_OWNER_ID, uname: NO_OWNER_NAME, gname: NO_OWNER_NAME }
const FILE_MODE = 0o644
const DIRECTORY_MODE = 0o755
const NO_BYTES = 0
const NO_BODY = new Uint8Array()
const DIRECTORY_SUFFIX = '/'

async function writeInto(controller: TarPackController, header: TarHeader, bytes: Uint8Array): Promise<void> {
  const writer = controller.add(header).getWriter()
  await writer.write(bytes)
  await writer.close()
}

async function packPlan(controller: TarPackController, plan: ArchivePlan): Promise<void> {
  await serially(plan.directories, async (directory) => {
    const { mtime } = await fs.stat(path.join(plan.base, directory))
    const name = `${directory}${DIRECTORY_SUFFIX}`
    const header: TarHeader = { name, type: 'directory', size: NO_BYTES, mode: DIRECTORY_MODE, mtime, ...UNOWNED }
    await writeInto(controller, header, NO_BODY)
  })

  await serially(plan.files, async (file) => {
    const target = path.join(plan.base, file)
    const bytes = await fs.readFile(target)
    const { mtime } = await fs.stat(target)
    const header: TarHeader = { name: file, type: 'file', size: bytes.length, mode: FILE_MODE, mtime, ...UNOWNED }
    await writeInto(controller, header, bytes)
  })
}

async function packed(controller: TarPackController, plan: ArchivePlan): Promise<void> {
  try {
    await packPlan(controller, plan)
    controller.finalize()
  } catch (error) {
    logArchive('aborted: %s', toError(error).message)
    controller.error(error)
  }
}

function tarGzStream(plan: ArchivePlan): ReadableStream<Uint8Array> {
  const { readable, controller } = createTarPacker()
  void packed(controller, plan)

  return readable.pipeThrough(new CompressionStream('gzip'))
}

const WRITERS: Readonly<Record<ArchiveFormat, (plan: ArchivePlan) => ReadableStream<Uint8Array>>> = {
  zip: zipStream,
  'tar.gz': tarGzStream,
}

export function archiveStream(plan: ArchivePlan, format: ArchiveFormat): ReadableStream<Uint8Array> {
  const { [format]: write } = WRITERS

  return write(plan)
}
