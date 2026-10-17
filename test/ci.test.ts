'use sanity'

import { describe, expect, it } from 'vitest'

import { runningInCI } from './ci.ts'

describe('deciding whether this is a pipeline or a developer', () => {
  it.each([['true'], ['1'], ['yes']])('reads CI=%s as a pipeline', (value) => {
    expect(runningInCI({ CI: value })).toBe(true)
  })

  it.each([['false'], ['0'], ['']])(
    'reads CI=%s as a deliberate opt-out, which is a real thing people set',
    (value) => {
      expect(runningInCI({ CI: value })).toBe(false)
    },
  )

  it('reads an unset CI as a developer', () => {
    expect(runningInCI({})).toBe(false)
  })
})
