'use sanity'

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import {
  addedLinesIn,
  filesFrom,
  findings,
  judgeInTurn,
  pathspecFor,
  slownessWarning,
  statusFor,
} from '../../tools/aftertest.ts'
import type { Mutant, Outcome } from '../../tools/mutate.ts'
import { runningInCI } from '../ci.ts'

const IN_WORK = { file: 'src/a.ts', line: 1, from: '===', to: '!==', expected: 'killed' as const }
const ELSEWHERE = { file: 'src/b.ts', line: 1, from: '===', to: '!==', expected: 'killed' as const }

describe('which files are in work', () => {
  it('takes a modified source file', () => {
    expect(filesFrom(' M src/a.ts\n')).toStrictEqual([{ file: 'src/a.ts', renamedFrom: null, untracked: false }])
  })

  it('marks an untracked file, which has no earlier version to compare against', () => {
    expect(filesFrom('?? src/a.ts\n')).toStrictEqual([{ file: 'src/a.ts', renamedFrom: null, untracked: true }])
  })

  it('takes the name a rename arrived at, not the one it left', () => {
    expect(filesFrom('R  src/a.ts -> src/b.ts\n')).toStrictEqual([
      { file: 'src/b.ts', renamedFrom: 'src/a.ts', untracked: false },
    ])
  })

  it('leaves out a file outside the source tree, which carries no mutants', () => {
    expect(filesFrom(' M test/a.test.ts\n M package.json\n')).toStrictEqual([])
  })

  it('leaves out a source file that is not TypeScript', () => {
    expect(filesFrom(' M src/templates/editor.pug\n')).toStrictEqual([])
  })

  it('reads nothing from an unchanged tree', () => {
    expect(filesFrom('')).toStrictEqual([])
  })
})

describe('which paths a file is asked about', () => {
  it('names the file alone when it only changed', () => {
    expect(pathspecFor({ file: 'src/a.ts', renamedFrom: null, untracked: false })).toStrictEqual(['src/a.ts'])
  })

  it('names both sides of a rename, which is what lets git pair them into one move', () => {
    expect(pathspecFor({ file: 'src/b.ts', renamedFrom: 'src/a.ts', untracked: false })).toStrictEqual([
      'src/a.ts',
      'src/b.ts',
    ])
  })
})

describe('which lines a diff added', () => {
  it('takes every line of a multi-line hunk', () => {
    expect([...addedLinesIn('@@ -1,0 +4,3 @@\n')]).toStrictEqual([4, 5, 6])
  })

  it('takes the one line of a hunk that names no count', () => {
    expect([...addedLinesIn('@@ -7 +9 @@\n')]).toStrictEqual([9])
  })

  it('takes nothing from a hunk that only deleted, so a removal judges nothing', () => {
    expect([...addedLinesIn('@@ -3,2 +2,0 @@\n')]).toStrictEqual([])
  })

  it('gathers every hunk, because one file can change in several places', () => {
    expect([...addedLinesIn('@@ -1 +1 @@\n context\n@@ -9,0 +12,2 @@\n')]).toStrictEqual([1, 12, 13])
  })

  it('reads nothing from a diff with no hunks at all', () => {
    expect([...addedLinesIn('diff --git a/src/a.ts b/src/b.ts\nsimilarity index 100%\n')]).toStrictEqual([])
  })
})

describe('what a sweep does to the exit status', () => {
  it('passes when nothing survived', () => {
    expect(statusFor([])).toBe(0)
  })

  it('fails outright, because every survivor sits in work about to be committed', () => {
    expect(statusFor([IN_WORK])).toBe(1)
  })
})

describe('flagging a sweep that took too long', () => {
  it('says nothing about a sweep inside the budget', () => {
    expect(slownessWarning(119_000, 100, 9)).toBeNull()
  })

  it('names the seconds, so the reader can tell a slow test from a large commit', () => {
    expect(slownessWarning(134_000, 310, 41)).toContain('134s')
  })

  it('names how many mutants it judged, which separates size from slowness', () => {
    expect(slownessWarning(134_000, 310, 41)).toContain('310 mutants')
  })

  it('names how many files they came from, which is the one a reviewer feels', () => {
    expect(slownessWarning(134_000, 310, 41)).toContain('41 files')
  })
})

describe('watching a sweep run', () => {
  const KILLED = 'killed' as const
  const SURVIVED = 'survived' as const

  interface Fake {
    say: (line: string) => void
    tryOne: (mutant: Mutant) => Promise<Outcome>
  }

  function logging(into: string[], fate: Outcome['fate']): Fake {
    return {
      say: (line) => {
        into.push(`said ${line.trim()}`)
      },
      tryOne: async (mutant) => {
        into.push(`ran ${mutant.file}:${String(mutant.line)}`)

        return await Promise.resolve({ mutant, fate })
      },
    }
  }

  it('names a mutant before running it, so a slow one never reads as a wedge', async () => {
    const log: string[] = []
    const { say, tryOne } = logging(log, KILLED)

    await judgeInTurn([IN_WORK, ELSEWHERE], tryOne, say)

    expect(log.at(0)).toContain('said')
  })

  it('names each in turn, so the line on screen is the one being run', async () => {
    const log: string[] = []
    const { say, tryOne } = logging(log, KILLED)

    await judgeInTurn([IN_WORK, ELSEWHERE], tryOne, say)

    expect(log.filter((entry) => entry.startsWith('said'))).toHaveLength(2)
  })

  it('counts the mutant against the size of the sweep, so the end is in sight', async () => {
    const said: string[] = []
    const { tryOne } = logging([], KILLED)

    await judgeInTurn([IN_WORK, ELSEWHERE], tryOne, (line) => {
      said.push(line)
    })

    expect(said.at(1)).toContain('[2/2]')
  })

  it('says which mutant, because the count alone names nothing', async () => {
    const said: string[] = []
    const { tryOne } = logging([], KILLED)

    await judgeInTurn([IN_WORK], tryOne, (line) => {
      said.push(line)
    })

    expect(said.at(0)).toContain('src/a.ts:1')
  })

  it('hands back what each one answered, so the caller decides what counts', async () => {
    const { say, tryOne } = logging([], SURVIVED)

    expect(await judgeInTurn([IN_WORK], tryOne, say)).toStrictEqual([{ mutant: IN_WORK, fate: SURVIVED }])
  })
})

describe('which answers are findings', () => {
  const KILLED = 'killed' as const
  const CLAIMED = { ...ELSEWHERE, expected: 'survived' as const }

  it('counts one that lived where its own test should have killed it', () => {
    expect(findings([{ mutant: IN_WORK, fate: 'survived' }])).toStrictEqual([IN_WORK])
  })

  it('counts one that died although a marker claimed it would live, because the claim has expired', () => {
    expect(findings([{ mutant: CLAIMED, fate: KILLED }])).toStrictEqual([CLAIMED])
  })

  it('leaves out one that died as expected', () => {
    expect(findings([{ mutant: IN_WORK, fate: KILLED }])).toStrictEqual([])
  })

  it('leaves out one that ran out of time, because a run that never finished proved nothing', () => {
    expect(findings([{ mutant: IN_WORK, fate: 'unresolved' }])).toStrictEqual([])
  })
})

describe('when the sweep does not run at all', () => {
  const SETS_CI = /^\s*CI=(?<value>\S+)/mv

  it('stands down for the value the Dockerfile actually sets, rather than one it might have set', async () => {
    const { value } = SETS_CI.exec(await readFile('Dockerfile', 'utf8'))?.groups ?? {}

    expect(runningInCI({ CI: value })).toBe(true)
  })

  it('finds that the image build sets it at all, so the check above is not reading nothing', async () => {
    expect(SETS_CI.test(await readFile('Dockerfile', 'utf8'))).toBe(true)
  })

  it('runs for a developer, who sets nothing', () => {
    expect(runningInCI({})).toBe(false)
  })
})
