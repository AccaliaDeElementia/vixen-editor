'use sanity'

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { nullWhenAbsent } from './storage/absence.ts'

const CLIENT_BUNDLE = 'assets/main.js'

export async function buildIdFor(publicDir: string): Promise<string | null> {
  const bundle = await nullWhenAbsent(async () => await fs.readFile(path.join(publicDir, CLIENT_BUNDLE)))
  if (bundle === null) return null

  return createHash('sha256').update(bundle).digest('hex')
}
