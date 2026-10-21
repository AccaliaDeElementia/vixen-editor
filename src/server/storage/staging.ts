'use sanity'

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { EMPTY } from '../../shared/sequences.ts'
import { compareNames } from './primitives/name-order.ts'
import { createLogger } from '../platform/logging.ts'
import { nullWhenAbsent } from './primitives/absence.ts'
import { serially } from '../../shared/serially.ts'

const logStaging = createLogger('storage/staging')

const STAGING_DIRECTORY = '.imports'

function stagingRoot(docsRoot: string): string {
  return path.join(docsRoot, STAGING_DIRECTORY)
}

export async function clearStaging(docsRoot: string): Promise<string[]> {
  const staging = stagingRoot(docsRoot)
  const abandoned = await nullWhenAbsent(async () => await fs.readdir(staging))
  if (abandoned === null || abandoned.length === EMPTY) return []

  await serially(abandoned, async (name) => {
    await fs.rm(path.join(staging, name), { recursive: true, force: true })
  })
  logStaging('removed %d abandoned staged import(s)', abandoned.length)

  return [...abandoned].sort(compareNames)
}

export async function stageArchive(docsRoot: string): Promise<string> {
  const staging = stagingRoot(docsRoot)
  await fs.mkdir(staging, { recursive: true })

  return path.join(staging, `${randomUUID()}.archive`)
}

export const TestOnly = { STAGING_DIRECTORY, stagingRoot }
