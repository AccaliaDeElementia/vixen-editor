'use sanity'

import { describe, expect, it } from 'vitest'

import { censusFrom, sourcesIn } from '../../tools/census.ts'
import type { Outcome } from '../../tools/mutate.ts'

const TAKEN_ON = '2026-10-21'
const KILLED: Outcome = {
  mutant: { file: 'src/a.ts', line: 7, from: '===', to: '!==', expected: 'killed' },
  fate: 'killed',
}
const SURVIVED: Outcome = {
  mutant: { file: 'src/b.ts', line: 12, from: ' && ', to: ' || ', expected: 'killed' },
  fate: 'survived',
}

describe('which files a census covers', () => {
  it('takes the TypeScript under the source root', () => {
    expect(sourcesIn('src', ['a.ts', 'nested/b.ts'])).toStrictEqual(['src/a.ts', 'src/nested/b.ts'])
  })

  it('leaves out anything that is not TypeScript, because nothing else carries a mutant', () => {
    expect(sourcesIn('src', ['a.ts', 'templates/editor.pug', 'assets/icon.svg'])).toStrictEqual(['src/a.ts'])
  })
})

describe('writing a census down', () => {
  it('dates it, because a census is only true of the day it was taken', () => {
    expect(censusFrom([KILLED], TAKEN_ON)).toContain(TAKEN_ON)
  })

  it('counts what it judged, which is the claim a plan quotes', () => {
    expect(censusFrom([KILLED, SURVIVED], TAKEN_ON)).toContain('2 mutants')
  })

  it('counts what survived, which is the backlog', () => {
    expect(censusFrom([KILLED, SURVIVED], TAKEN_ON)).toContain('1 survived')
  })

  it('names each survivor, so the backlog can be worked without re-running the sweep', () => {
    expect(censusFrom([KILLED, SURVIVED], TAKEN_ON)).toContain('src/b.ts:12')
  })

  it('leaves out what died, because a killed mutant is not work', () => {
    expect(censusFrom([KILLED, SURVIVED], TAKEN_ON)).not.toContain('src/a.ts')
  })

  it('says so plainly when nothing survived, rather than printing an empty table', () => {
    expect(censusFrom([KILLED], TAKEN_ON)).toContain('nothing survived')
  })
})
