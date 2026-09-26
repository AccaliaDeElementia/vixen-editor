'use sanity'

import { describe, expect, it } from 'vitest'

import { serially } from '../../src/shared/serially.ts'

describe('serially', () => {
  it('runs the step against every item', async () => {
    const seen: string[] = []

    await serially(['a', 'b', 'c'], async (item) => {
      seen.push(item)
      await Promise.resolve()
    })

    expect(seen).toStrictEqual(['a', 'b', 'c'])
  })

  it('does nothing when there is nothing to step over', async () => {
    const seen: string[] = []

    await serially([], async (item: string) => {
      seen.push(item)
      await Promise.resolve()
    })

    expect(seen).toStrictEqual([])
  })

  it('never has two steps in flight, which is the whole reason it exists', async () => {
    let running = 0
    let overlapped = false

    await serially([1, 2, 3], async () => {
      running += 1
      overlapped ||= running > 1
      await Promise.resolve()
      running -= 1
    })

    expect(overlapped).toBe(false)
  })

  it('waits for a slow step before starting the next', async () => {
    const release = Promise.withResolvers<string>()
    const order: string[] = []

    const run = serially(['slow', 'fast'], async (item) => {
      order.push(`start ${item}`)
      if (item === 'slow') order.push(await release.promise)
      order.push(`end ${item}`)
    })

    await Promise.resolve()

    expect(order).toStrictEqual(['start slow'])

    release.resolve('released slow')
    await run

    expect(order).toStrictEqual(['start slow', 'released slow', 'end slow', 'start fast', 'end fast'])
  })

  it('stops at a rejecting step rather than running the rest', async () => {
    const seen: string[] = []

    const run = serially(['a', 'b', 'c'], async (item) => {
      seen.push(item)
      await Promise.resolve()
      if (item === 'b') throw new Error('refused')
    })

    await expect(run).rejects.toThrow('refused')
    expect(seen).toStrictEqual(['a', 'b'])
  })

  it('accepts any iterable, not only an array', async () => {
    const seen: Array<[string, number]> = []

    await serially(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
      async (entry) => {
        seen.push(entry)
        await Promise.resolve()
      },
    )

    expect(seen).toStrictEqual([
      ['a', 1],
      ['b', 2],
    ])
  })
})
