'use sanity'

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { eligible, findings, judgeInTurn, keyOf, sample, statusFor } from '../../tools/aftertest.ts'
import type { Mutant, Outcome } from '../../tools/mutate.ts'
import { runningInCI } from '../ci.ts'

const BUDGET = 8
const IN_WORK = { file: 'src/a.ts', line: 1, from: '===', to: '!==', expected: 'killed' as const }
const ALSO_IN_WORK = { ...IN_WORK, line: 2 }
const ELSEWHERE = { file: 'src/b.ts', line: 1, from: '===', to: '!==', expected: 'killed' as const }

interface Named {
  file: string
}

function inOrder(items: readonly Named[], count: number): Named[] {
  return items.slice(0, count)
}

function manyIn(file: string, howMany: number): Array<typeof IN_WORK> {
  return Array.from({ length: howMany }, (_unused, index) => ({ ...IN_WORK, file, line: index + 1 }))
}

describe('which mutants a run is still allowed to draw', () => {
  it('drops one drawn recently, so a later run reaches further into the file', () => {
    expect(eligible([IN_WORK, ALSO_IN_WORK], [keyOf(IN_WORK)])).toStrictEqual([ALSO_IN_WORK])
  })

  it('keeps one never drawn', () => {
    expect(eligible([IN_WORK], [])).toStrictEqual([IN_WORK])
  })
})

describe('drawing a sample', () => {
  it('takes no more than the budget', () => {
    expect(sample(manyIn('src/a.ts', 50), manyIn('src/b.ts', 50), BUDGET, inOrder)).toHaveLength(BUDGET)
  })

  it('spends most of the budget on the work in progress', () => {
    const drawn = sample(manyIn('src/a.ts', 50), manyIn('src/b.ts', 50), BUDGET, inOrder)

    expect(drawn.filter((mutant) => mutant.file === 'src/a.ts')).toHaveLength(BUDGET - 1)
  })

  it('always keeps one for a file nobody is editing, which nothing else would reach', () => {
    const drawn = sample(manyIn('src/a.ts', 50), manyIn('src/b.ts', 50), BUDGET, inOrder)

    expect(drawn.filter((mutant) => mutant.file === 'src/b.ts')).toHaveLength(1)
  })

  it('spends the whole budget elsewhere when nothing is being edited', () => {
    expect(sample([], manyIn('src/b.ts', 50), BUDGET, inOrder)).toHaveLength(BUDGET)
  })

  it('takes what there is when the pool is smaller than the budget', () => {
    expect(sample([IN_WORK], [ELSEWHERE], BUDGET, inOrder)).toHaveLength(2)
  })
})

describe('watching a sample run', () => {
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
        into.push(`ran ${keyOf(mutant)}`)

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

  it('counts the mutant against the size of the draw, so the end is in sight', async () => {
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

  it('counts one that lived where a test should have killed it', () => {
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

describe('what a sample does to the exit status', () => {
  it('passes when nothing survived', () => {
    expect(statusFor([], ['src/a.ts'])).toBe(0)
  })

  it('fails outright when a survivor sits in work about to be committed', () => {
    expect(statusFor([IN_WORK], ['src/a.ts'])).toBe(1)
  })

  it('reports a finding when the survivor is in a file nobody touched', () => {
    expect(statusFor([ELSEWHERE], ['src/a.ts'])).toBe(5)
  })

  it('takes the harder verdict when survivors fall on both sides', () => {
    expect(statusFor([ELSEWHERE, IN_WORK], ['src/a.ts'])).toBe(1)
  })
})

describe('when the sample does not run at all', () => {
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
