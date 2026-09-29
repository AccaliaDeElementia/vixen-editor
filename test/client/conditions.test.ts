'use sanity'

import { describe, expect, it } from 'vitest'

import { given, waitUntil } from '../conditions.ts'

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

describe('waitUntil, which marks an awaited assertion as driving rather than a claim', () => {
  it('resolves to whatever it was waiting on', async () => {
    await expect(waitUntil(Promise.resolve('ready'))).resolves.toBe('ready')
  })

  it('re-throws a rejection rather than swallowing it', async () => {
    await expect(waitUntil(Promise.reject(new Error('never appeared')))).rejects.toThrow('never appeared')
  })
})
