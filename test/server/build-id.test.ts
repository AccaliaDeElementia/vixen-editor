'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildIdFor } from '../../src/server/build-id.ts'

let publicDir = ''

async function writeBundle(contents: string): Promise<void> {
  await fs.mkdir(path.join(publicDir, 'assets'), { recursive: true })
  await fs.writeFile(path.join(publicDir, 'assets', 'main.js'), contents)
}

beforeEach(async () => {
  publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-build-'))
})

afterEach(async () => {
  await fs.rm(publicDir, { recursive: true, force: true })
})

describe('the identity of the build being served', () => {
  it('comes from the artifact, so a restart alone does not change it', async () => {
    await writeBundle('console.log(1)')
    const first = await buildIdFor(publicDir)

    const again = await buildIdFor(publicDir)

    expect(again).toBe(first)
  })

  it('changes when the bundle does, which is the whole point', async () => {
    await writeBundle('console.log(1)')
    const before = await buildIdFor(publicDir)
    await writeBundle('console.log(2)')

    const after = await buildIdFor(publicDir)

    expect(after).not.toBe(before)
  })

  it('is unknown rather than invented when there is no bundle to read', async () => {
    expect(await buildIdFor(publicDir)).toBeNull()
  })
})
