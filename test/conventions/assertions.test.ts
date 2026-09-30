'use sanity'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { TestOnly } from '../../scripts/assertions.ts'

const { countIn, disagreements, listing } = TestOnly

const FIXTURES = path.join(import.meta.dirname, 'assertion-fixtures')

async function scan(fixture: string): Promise<ReturnType<typeof countIn>> {
  const text = await readFile(path.join(FIXTURES, `${fixture}.txt`), 'utf8')

  return countIn(`${fixture}.test.ts`, text)
}

async function only(fixture: string): Promise<ReturnType<typeof countIn>[number]> {
  const [first] = await scan(fixture)
  if (first === undefined) throw new Error(`${fixture} held no declaration`)

  return first
}

describe('a plain declaration', () => {
  it('is found', async () => {
    expect(await scan('plain')).toHaveLength(1)
  })

  it('reports the one assertion in its body', async () => {
    expect((await only('plain')).assertions).toBe(1)
  })

  it('reports the name a failure would print', async () => {
    expect((await only('plain')).name).toBe('names one behaviour')
  })
})

describe('a declaration behind an each table, whose own quotes come before the name', () => {
  it('is found', async () => {
    expect(await scan('each-table')).toHaveLength(1)
  })

  it('is named from the template rather than the first row', async () => {
    expect((await only('each-table')).name).toBe('reads %s')
  })

  it('reports the assertion in the callback, not the rows', async () => {
    expect((await only('each-table')).assertions).toBe(1)
  })
})

describe('a declaration behind a type argument on each', () => {
  it('is found, having once been invisible', async () => {
    expect(await scan('each-type-argument')).toHaveLength(1)
  })

  it('is named from the template', async () => {
    expect((await only('each-type-argument')).name).toBe('shows only the %s view')
  })
})

describe('a body holding a regex literal whose quotes do not balance', () => {
  it('ends where its own test ends, rather than swallowing the next one', async () => {
    expect((await scan('regex-in-body')).map(({ assertions }) => assertions)).toStrictEqual([1, 1])
  })
})

describe('a helper declared inside the next describe', () => {
  it('is attributed to no test, so each keeps only its own body', async () => {
    expect((await scan('helper-between-describes')).map(({ assertions }) => assertions)).toStrictEqual([1, 1])
  })
})

describe('a callback that is a named function rather than an arrow', () => {
  it('is still reported as a declaration, or the runners and the scanner disagree', async () => {
    expect(await scan('named-callback')).toHaveLength(1)
  })

  it('reports its assertions as unread, because the body is elsewhere', async () => {
    expect((await only('named-callback')).assertions).toBeNull()
  })
})

describe('an assertion marked as a gate', () => {
  it('is discounted, leaving only the claim', async () => {
    expect((await only('marked-gate')).assertions).toBe(1)
  })
})

describe('a test that asserts nothing', () => {
  it('reports zero rather than being skipped', async () => {
    expect((await only('silent')).assertions).toBe(0)
  })
})

const SCANNED = [
  { file: 'a.test.ts', line: 1, name: 'one', assertions: 1 },
  { file: 'b.test.ts', line: 1, name: 'two', assertions: 1 },
]

describe('disagreements, which compare the scanner against the runners', () => {
  it('finds none when every file agrees', () => {
    expect(
      disagreements(
        SCANNED,
        new Map([
          ['a.test.ts', 1],
          ['b.test.ts', 1],
        ]),
      ),
    ).toStrictEqual([])
  })

  it('reports a file the scanner reads more tests in than the runners run', () => {
    expect(
      disagreements(
        SCANNED,
        new Map([
          ['a.test.ts', 1],
          ['b.test.ts', 2],
        ]),
      ),
    ).toStrictEqual([{ file: 'b.test.ts', scanned: 1, listed: 2 }])
  })

  it('reports a file the runners run and the scanner never read', () => {
    expect(disagreements(SCANNED, new Map([['a.test.ts', 1]]))).toStrictEqual([
      { file: 'b.test.ts', scanned: 1, listed: 0 },
    ])
  })

  it('reports a file the scanner read that no runner runs, which is how an orphan spec shows', () => {
    expect(
      disagreements(
        SCANNED,
        new Map([
          ['a.test.ts', 1],
          ['b.test.ts', 1],
          ['orphan.test.ts', 2],
        ]),
      ),
    ).toStrictEqual([{ file: 'orphan.test.ts', scanned: 0, listed: 2 }])
  })

  it('orders them by file, so a long report reads in one pass', () => {
    expect(
      disagreements(
        [],
        new Map([
          ['z.test.ts', 1],
          ['a.test.ts', 1],
        ]),
      ).map(({ file }) => file),
    ).toStrictEqual(['a.test.ts', 'z.test.ts'])
  })
})

describe('a lister that cannot run', () => {
  it('rejects, because a failure that read as agreement would be the vacuous gate this exists to find', async () => {
    await expect(listing('vitest', 'vixen-no-such-lister', [])).rejects.toThrow()
  })

  it('names which lister failed', async () => {
    await expect(listing('playwright', 'vixen-no-such-lister', [])).rejects.toThrow(/playwright/v)
  })
})
