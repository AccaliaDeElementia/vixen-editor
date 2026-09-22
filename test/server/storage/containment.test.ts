'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isAtOrInside, realpathOrNull } from '../../../src/server/storage/containment.ts'

const ROOT = path.resolve('/srv/vixen/docs')

let base: string

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-containment-'))
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

describe('isAtOrInside', () => {
  it('accepts the root itself, which is where a flat document lands', () => {
    expect(isAtOrInside(ROOT, ROOT)).toBe(true)
  })

  it('accepts a path below the root', () => {
    expect(isAtOrInside(ROOT, path.join(ROOT, 'journal', 'a.md'))).toBe(true)
  })

  it('rejects a path outside the root', () => {
    expect(isAtOrInside(ROOT, path.resolve('/etc/passwd'))).toBe(false)
  })

  it('rejects a sibling whose name merely starts with the root, which a bare prefix test would let through', () => {
    expect(isAtOrInside(ROOT, `${ROOT}-backup/a.md`)).toBe(false)
  })

  it('rejects the parent of the root', () => {
    expect(isAtOrInside(ROOT, path.dirname(ROOT))).toBe(false)
  })
})

describe('realpathOrNull', () => {
  it('resolves an existing path', async () => {
    await expect(realpathOrNull(base)).resolves.toBe(await fs.realpath(base))
  })

  it('follows a symlink to its target', async () => {
    const target = path.join(base, 'real.md')
    await fs.writeFile(target, 'x')
    await fs.symlink(target, path.join(base, 'alias.md'))

    await expect(realpathOrNull(path.join(base, 'alias.md'))).resolves.toBe(await fs.realpath(target))
  })

  it('returns null for a path that is not there', async () => {
    await expect(realpathOrNull(path.join(base, 'absent'))).resolves.toBeNull()
  })

  it('returns null when a parent is a file rather than a directory', async () => {
    await fs.writeFile(path.join(base, 'file'), 'x')

    await expect(realpathOrNull(path.join(base, 'file', 'child'))).resolves.toBeNull()
  })

  it('surfaces a genuine filesystem fault rather than reporting the path as absent', async () => {
    // NAME_MAX is 255, so a longer filename yields ENAMETOOLONG rather than ENOENT.
    await expect(realpathOrNull(path.join(base, 'a'.repeat(300)))).rejects.toThrow(
      expect.objectContaining({ code: 'ENAMETOOLONG' }),
    )
  })
})
