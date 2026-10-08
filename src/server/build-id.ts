'use sanity'

import { createHash, type Hash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { nullWhenAbsent } from './storage/absence.ts'

const ASSETS = 'assets'
const CLIENT_BUNDLE = 'assets/main.js'
const TEMPLATE_EXTENSION = '.pug'
const NOTHING_FOUND: string[] = []

async function filesUnder(directory: string, matching: (name: string) => boolean): Promise<string[]> {
  const entries = await nullWhenAbsent(
    async () => await fs.readdir(directory, { withFileTypes: true, recursive: true }),
  )
  if (entries === null) return NOTHING_FOUND

  return entries
    .filter((entry) => entry.isFile() && matching(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort()
}

async function foldInto(digest: Hash, directory: string, files: readonly string[]): Promise<void> {
  const read = await Promise.all(
    files.map(async (file) => ({ named: path.relative(directory, file), bytes: await fs.readFile(file) })),
  )

  for (const { named, bytes } of read) {
    digest.update(named)
    digest.update(bytes)
  }
}

function anyName(): boolean {
  return true
}

function isTemplate(name: string): boolean {
  return name.endsWith(TEMPLATE_EXTENSION)
}

export async function buildIdFor(publicDir: string, templatesDir: string): Promise<string | null> {
  const bundle = await nullWhenAbsent(async () => await fs.readFile(path.join(publicDir, CLIENT_BUNDLE)))
  if (bundle === null) return null

  const served = path.join(publicDir, ASSETS)
  const digest = createHash('sha256')

  await foldInto(digest, served, await filesUnder(served, anyName))
  await foldInto(digest, templatesDir, await filesUnder(templatesDir, isTemplate))

  return digest.digest('hex')
}
