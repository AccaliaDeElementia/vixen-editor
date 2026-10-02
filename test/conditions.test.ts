'use sanity'

import { describe, expect, it } from 'vitest'

import { given, givenAsync } from './conditions.ts'

describe('given, which marks an assertion as a gate rather than a claim', () => {
  it('runs what it was handed', () => {
    let ran = false

    given(() => {
      ran = true
    })

    expect(ran).toBe(true)
  })

  it('re-throws, because a gate that passed silently would be worse than no gate', () => {
    expect(() => {
      given(() => {
        throw new Error('the cache was already clear')
      })
    }).toThrow('the cache was already clear')
  })
})

describe('givenAsync, the same gate for a condition that has to be awaited', () => {
  it('resolves to whatever the condition resolved to', async () => {
    await expect(givenAsync(Promise.resolve('ready'))).resolves.toBe('ready')
  })

  it('re-throws a rejection rather than swallowing it', async () => {
    await expect(givenAsync(Promise.reject(new Error('never appeared')))).rejects.toThrow('never appeared')
  })
})
