'use sanity'

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { eligible, keyOf, sample, statusFor } from '../../tools/aftertest.ts'
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
