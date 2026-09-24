'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createFileAtomic,
  isTemporaryName,
  replaceFileAtomic,
  TestOnly,
} from '../../../src/server/storage/atomic-write.ts'
import { isAllowedName } from '../../../src/server/storage/safe-path.ts'

const { temporaryBeside } = TestOnly

const MAX_NAME_BYTES = 255

let base: string

function at(name: string): string {
  return path.join(base, name)
}

async function namesIn(directory: string): Promise<string[]> {
  return (await fs.readdir(directory)).sort()
}

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-atomic-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(base, { recursive: true, force: true })
})

// The temporary exists from the moment it is opened, so a failure part way
// through filling it is not the same case as a failure to create it at all.
// ENOSPC is the one that matters: a leak there consumes the very space whose
// exhaustion caused it, so each failed write makes the next one likelier.
function failEveryWriteWithNoSpace(): void {
  const open = fs.open.bind(fs)

  vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args)
    vi.spyOn(handle, 'writeFile').mockRejectedValue(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }))

    return handle
  })
}

describe('replaceFileAtomic', () => {
  it('writes content to a name that is free', async () => {
    await replaceFileAtomic(at('note.md'), '# fresh')

    await expect(fs.readFile(at('note.md'), 'utf8')).resolves.toBe('# fresh')
  })

  it('replaces the content of a name that is taken', async () => {
    await fs.writeFile(at('note.md'), '# old')

    await replaceFileAtomic(at('note.md'), '# new')

    await expect(fs.readFile(at('note.md'), 'utf8')).resolves.toBe('# new')
  })

  it('writes bytes as given', async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47])

    await replaceFileAtomic(at('image.png'), bytes)

    await expect(fs.readFile(at('image.png'))).resolves.toEqual(Buffer.from(bytes))
  })

  it('leaves no temporary behind', async () => {
    await replaceFileAtomic(at('note.md'), '# fresh')

    await expect(namesIn(base)).resolves.toEqual(['note.md'])
  })

  it('leaves no temporary behind when placing the file fails', async () => {
    await fs.mkdir(at('note.md'))

    await expect(replaceFileAtomic(at('note.md'), '# fresh')).rejects.toThrow()

    await expect(namesIn(base)).resolves.toEqual(['note.md'])
  })

  it('propagates a failure to write the temporary', async () => {
    await expect(replaceFileAtomic(at('absent/note.md'), '# fresh')).rejects.toThrow('ENOENT')
  })
})

describe('a write that fails after the temporary has been opened', () => {
  it('propagates the failure', async () => {
    failEveryWriteWithNoSpace()

    await expect(replaceFileAtomic(at('note.md'), '# fresh')).rejects.toThrow('ENOSPC')
  })

  it('leaves no temporary behind, so a full disk does not fill further on every retry', async () => {
    failEveryWriteWithNoSpace()

    await expect(replaceFileAtomic(at('note.md'), '# fresh')).rejects.toThrow('ENOSPC')

    await expect(namesIn(base)).resolves.toStrictEqual([])
  })

  it('leaves the previous version of the document in place', async () => {
    await fs.writeFile(at('note.md'), '# old')
    failEveryWriteWithNoSpace()

    await expect(replaceFileAtomic(at('note.md'), '# new')).rejects.toThrow('ENOSPC')

    vi.restoreAllMocks()
    await expect(fs.readFile(at('note.md'), 'utf8')).resolves.toBe('# old')
  })

  it('creates nothing when it was a create that failed', async () => {
    failEveryWriteWithNoSpace()

    await expect(createFileAtomic(at('note.md'), '# fresh')).rejects.toThrow('ENOSPC')

    await expect(namesIn(base)).resolves.toStrictEqual([])
  })
})

describe('createFileAtomic', () => {
  it('writes content to a name that is free', async () => {
    await createFileAtomic(at('note.md'), '# fresh')

    await expect(fs.readFile(at('note.md'), 'utf8')).resolves.toBe('# fresh')
  })

  it('refuses a name that is taken', async () => {
    await fs.writeFile(at('note.md'), '# old')

    await expect(createFileAtomic(at('note.md'), '# new')).rejects.toThrow('EEXIST')
  })

  it('leaves the existing content untouched when it refuses', async () => {
    await fs.writeFile(at('note.md'), '# old')

    await expect(createFileAtomic(at('note.md'), '# new')).rejects.toThrow('EEXIST')

    await expect(fs.readFile(at('note.md'), 'utf8')).resolves.toBe('# old')
  })

  it('leaves no temporary behind', async () => {
    await createFileAtomic(at('note.md'), '# fresh')

    await expect(namesIn(base)).resolves.toEqual(['note.md'])
  })

  it('leaves no temporary behind when it refuses', async () => {
    await fs.writeFile(at('note.md'), '# old')

    await expect(createFileAtomic(at('note.md'), '# new')).rejects.toThrow('EEXIST')

    await expect(namesIn(base)).resolves.toEqual(['note.md'])
  })
})

// A replace that truncates and rewrites in place keeps the inode and is
// observably torn part way through; one that swaps a finished file into the
// path replaces the inode and never is. The inode is the part of that a test
// can state without racing the write.
describe('replacing rather than rewriting in place', () => {
  it('leaves a different file at the path than it found', async () => {
    const target = at('note.md')
    await fs.writeFile(target, '# old')
    const before = await fs.stat(target)

    await replaceFileAtomic(target, '# new')

    const after = await fs.stat(target)
    expect(after.ino).not.toBe(before.ino)
  })

  it('leaves a handle opened beforehand reading the content it was opened on', async () => {
    const target = at('note.md')
    await fs.writeFile(target, '# old')
    const handle = await fs.open(target, 'r')

    try {
      await replaceFileAtomic(target, '# new')

      await expect(handle.readFile('utf8')).resolves.toBe('# old')
      await expect(fs.readFile(target, 'utf8')).resolves.toBe('# new')
    } finally {
      await handle.close()
    }
  })
})

describe('temporaryBeside', () => {
  const longest = `${'a'.repeat(MAX_NAME_BYTES - '.md'.length)}.md`

  it('places the temporary in the same directory as the target', () => {
    expect(path.dirname(temporaryBeside(at('note.md')))).toBe(base)
  })

  it('names it so that a crash leaves an orphan nothing in the store will list', () => {
    expect(isAllowedName(path.basename(temporaryBeside(at('note.md'))))).toBe(false)
  })

  it('names it differently every time, so concurrent writes cannot collide', () => {
    expect(temporaryBeside(at('note.md'))).not.toBe(temporaryBeside(at('note.md')))
  })

  it('stays within the name limit for a target whose own name is at the limit', () => {
    expect(isAllowedName(longest)).toBe(true)
    expect(Buffer.byteLength(path.basename(temporaryBeside(at(longest))))).toBeLessThanOrEqual(MAX_NAME_BYTES)
  })

  it('does not stop a target at the name limit being written', async () => {
    await expect(createFileAtomic(at(longest), '# fresh')).resolves.toBeUndefined()

    await expect(fs.readFile(at(longest), 'utf8')).resolves.toBe('# fresh')
  })
})

// Removing the temporary is cleanup, not part of the write: whether it works
// says nothing about whether the data landed. Letting it propagate would
// replace a real error with a misleading one, or report failure for a file
// that was in fact created.
describe('a cleanup that fails', () => {
  function failEveryCleanup(): void {
    vi.spyOn(fs, 'rm').mockImplementation(async (...args: Parameters<typeof fs.rm>) => {
      const [target] = args
      if (typeof target === 'string' && target.endsWith('.tmp')) {
        throw Object.assign(new Error('EIO'), { code: 'EIO' })
      }

      await Promise.resolve()
    })
  }

  it('does not replace the failure that actually stopped the write', async () => {
    failEveryWriteWithNoSpace()
    failEveryCleanup()

    await expect(replaceFileAtomic(at('note.md'), '# fresh')).rejects.toThrow('ENOSPC')
  })

  it('does not turn a completed create into a reported failure', async () => {
    failEveryCleanup()

    await expect(createFileAtomic(at('note.md'), '# fresh')).resolves.toBeUndefined()

    vi.restoreAllMocks()
    await expect(fs.readFile(at('note.md'), 'utf8')).resolves.toBe('# fresh')
  })

  it('does not turn a completed replace into a reported failure', async () => {
    await fs.writeFile(at('note.md'), '# old')
    failEveryCleanup()

    await expect(replaceFileAtomic(at('note.md'), '# new')).resolves.toBeUndefined()

    vi.restoreAllMocks()
    await expect(fs.readFile(at('note.md'), 'utf8')).resolves.toBe('# new')
  })

  // The orphan is the accepted cost, and it is invisible for the same reason a
  // crash-orphaned one is: nothing in the store will list that name.
  it('leaves the temporary behind, where only a sweep will find it', async () => {
    failEveryCleanup()

    await createFileAtomic(at('note.md'), '# fresh')

    vi.restoreAllMocks()
    const left = (await namesIn(base)).filter((name) => name !== 'note.md')

    expect(left).toHaveLength(1)
    expect(left.every((name) => !isAllowedName(name))).toBe(true)
  })
})

// The sweep that collects abandoned temporaries has to recognise exactly what
// this module writes. One predicate, used by both, or the prefix changes on
// one side and the sweep quietly stops matching anything.
describe('isTemporaryName', () => {
  it('accepts the name this module generates', () => {
    expect(isTemporaryName(path.basename(temporaryBeside(at('note.md'))))).toBe(true)
  })

  it.each([
    ['a document', 'notes.md'],
    ['the trash', '.trash'],
    ['another dotfile', '.gitignore'],
    ['the prefix alone', '.vixen-'],
    ['the suffix alone', 'something.tmp'],
    ['a plausible near miss', '.vixen.tmp'],
  ])('rejects %s', (_name, candidate) => {
    expect(isTemporaryName(candidate)).toBe(false)
  })
})
