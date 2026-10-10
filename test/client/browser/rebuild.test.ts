'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { collectRuns, rebuildingRunner } from '../../../src/client/browser/rebuild.ts'
import type { Toast } from '../../../src/client/platform/toast.ts'

import { cast } from '../../cast.ts'
import { givenAsync } from '../../conditions.ts'

const ONE_RUN = 1

let order: string[] = []
let errors: string[] = []
let tracked: Array<Promise<void>> = []

function reporting(): Toast {
  return cast<Toast>({
    error: (message: string) => {
      errors.push(message)
    },
  })
}

function runner(refresh: () => Promise<void>): (work: () => Promise<(() => void) | undefined>) => void {
  return rebuildingRunner({
    refresh,
    toast: reporting(),
    track: (rebuild: Promise<void>) => {
      tracked.push(rebuild)
    },
  })
}

async function refreshing(): Promise<void> {
  await Promise.resolve()
  order.push('refresh')
}

async function settled(): Promise<void> {
  await Promise.all(tracked)
}

beforeEach(() => {
  order = []
  errors = []
  tracked = []
})

describe('waiting for the rebuilds a gesture set off', () => {
  async function workingAs(name: string): Promise<(() => void) | undefined> {
    await Promise.resolve()
    order.push(`work ${name}`)

    return () => {
      order.push(`after ${name}`)
    }
  }

  it('settles at once when nothing is in flight', async () => {
    await expect(collectRuns().settled()).resolves.toBeUndefined()
  })

  it('does not settle until the rebuild it is tracking has finished every step', async () => {
    const runs = collectRuns()
    rebuildingRunner({ refresh: refreshing, toast: reporting(), track: runs.track })(async () => await workingAs('it'))

    await runs.settled()

    expect(order).toStrictEqual(['work it', 'refresh', 'after it'])
  })

  it('waits for every rebuild, not only the first one it was handed', async () => {
    const runs = collectRuns()
    const run = rebuildingRunner({ refresh: refreshing, toast: reporting(), track: runs.track })
    run(async () => await workingAs('first'))
    run(async () => await workingAs('last'))

    await runs.settled()

    expect(order.filter((step) => step.startsWith('after'))).toStrictEqual(['after first', 'after last'])
  })
})

describe('a gesture that changes the store', () => {
  async function working(): Promise<(() => void) | undefined> {
    order.push('work')

    return await Promise.resolve(() => {
      order.push('after')
    })
  }

  it('does the work it was handed', async () => {
    runner(refreshing)(working)

    await settled()

    expect(order).toContain('work')
  })

  it('redraws the browser once the work is done, because the store has moved on', async () => {
    runner(refreshing)(working)

    await settled()

    expect(order).toStrictEqual(['work', 'refresh', 'after'])
  })

  it('runs nothing extra when the work asked for nothing afterwards', async () => {
    runner(refreshing)(async () => {
      await Promise.resolve()
      order.push('work')

      return undefined
    })

    await settled()

    expect(order).toStrictEqual(['work', 'refresh'])
  })

  it('hands the run to the caller, so a test can wait for a gesture to finish', () => {
    runner(refreshing)(working)

    expect(tracked).toHaveLength(ONE_RUN)
  })
})

describe('a gesture the store refused', () => {
  async function failing(): Promise<never> {
    order.push('work')

    return await Promise.reject(new Error('the store said no'))
  }

  it('says so, rather than failing silently', async () => {
    runner(refreshing)(failing)

    await settled()

    expect(errors).toStrictEqual(['the store said no'])
  })

  it('does not redraw, because nothing changed', async () => {
    runner(refreshing)(failing)

    await settled()

    expect(order).toStrictEqual(['work'])
  })

  it('still settles, so one refusal does not wedge every later gesture', async () => {
    runner(refreshing)(failing)
    await givenAsync(settled())

    await expect(settled()).resolves.toBeUndefined()
  })
})
