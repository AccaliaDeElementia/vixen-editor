'use sanity'

import { describe, expect, it } from 'vitest'

import { applyMutation, envFor, mutationIn } from '../../tools/mutant-transform.ts'

const SOURCE = ['const a = 1 === 1', 'const b = 2 === 2', 'const c = 3 === 3'].join('\n')
const ON_THE_SECOND_LINE = { file: 'src/a.ts', line: 2, from: '===', to: '!==' }

describe('applying a mutation to a source', () => {
  it('changes the line it names, not the first match in the file', () => {
    expect(applyMutation(SOURCE, ON_THE_SECOND_LINE).split('\n')[1]).toBe('const b = 2 !== 2')
  })

  it('leaves the other lines exactly as they were', () => {
    const lines = applyMutation(SOURCE, ON_THE_SECOND_LINE).split('\n')

    expect([lines[0], lines[2]]).toStrictEqual(['const a = 1 === 1', 'const c = 3 === 3'])
  })

  it('changes only the first match on that line, which is the one the planner counted', () => {
    expect(applyMutation('x === y === z', { ...ON_THE_SECOND_LINE, line: 1 })).toBe('x !== y === z')
  })

  it('leaves a source alone when the line it names is past the end', () => {
    expect(applyMutation(SOURCE, { ...ON_THE_SECOND_LINE, line: 99 })).toBe(SOURCE)
  })
})

describe('carrying a mutation to the child process', () => {
  it('round-trips through the environment, since that is how the runner is told', () => {
    expect(mutationIn(envFor(ON_THE_SECOND_LINE))).toStrictEqual(ON_THE_SECOND_LINE)
  })

  it('reads an unset environment as no mutation, so an ordinary run is untouched', () => {
    expect(mutationIn({})).toBeNull()
  })

  it('reads a blank target as no mutation', () => {
    expect(mutationIn({ VIXEN_MUTANT_FILE: '', VIXEN_MUTANT_FROM: '===' })).toBeNull()
  })
})
