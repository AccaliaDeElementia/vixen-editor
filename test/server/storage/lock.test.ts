'use sanity'

import { describe, expect, it, vi } from 'vitest'

import { createWriteLock, LockTimeoutError, type WriteLock } from '../../../src/server/storage/lock.ts'
import { gate } from '../gate.ts'

const GENEROUS_MS = 5000
const IMPATIENT_MS = 5

function lock(timeoutMs = GENEROUS_MS): WriteLock {
  return createWriteLock(timeoutMs)
}

function immediately<T>(value: T): () => Promise<T> {
  return () => Promise.resolve(value)
}

function recording<T>(log: T[], entry: T): () => Promise<void> {
  return () => {
    log.push(entry)
    return Promise.resolve()
  }
}

function failing(): () => Promise<never> {
  return () => Promise.reject(new Error('boom'))
}

describe('run', () => {
  it('returns the result of the operation', async () => {
    await expect(lock().run(immediately('done'))).resolves.toBe('done')
  })

  it('propagates a failure from the operation', async () => {
    await expect(lock().run(failing())).rejects.toThrow('boom')
  })

  it('runs an uncontended operation without waiting', async () => {
    const writes = lock()

    await writes.run(immediately(undefined))

    await expect(writes.run(immediately('second'))).resolves.toBe('second')
  })
})

describe('serialisation', () => {
  it('does not start a second operation while the first is running', async () => {
    const writes = lock()
    const first = gate()
    const started = gate()
    const order: string[] = []

    const running = writes.run(async () => {
      order.push('first:start')
      started.open()
      await first.hold()
      order.push('first:end')
    })
    const queued = writes.run(recording(order, 'second'))

    await started.hold()
    expect(order).toStrictEqual(['first:start'])
    first.open()
    await Promise.all([running, queued])

    expect(order).toStrictEqual(['first:start', 'first:end', 'second'])
  })

  it('grants waiters in the order they arrived', async () => {
    const writes = lock()
    const first = gate()
    const order: number[] = []

    const running = writes.run(first.hold)
    const queued = [1, 2, 3].map(async (n) => {
      await writes.run(recording(order, n))
    })

    first.open()
    await Promise.all([running, ...queued])

    expect(order).toStrictEqual([1, 2, 3])
  })

  it('releases the lock when the operation throws, rather than wedging every later write', async () => {
    const writes = lock()

    await expect(writes.run(failing())).rejects.toThrow('boom')

    await expect(writes.run(immediately('still works'))).resolves.toBe('still works')
  })
})

describe('acquire timeout', () => {
  it('rejects a waiter that cannot acquire the lock in time', async () => {
    const writes = lock(IMPATIENT_MS)
    const first = gate()
    const running = writes.run(first.hold)

    await expect(writes.run(immediately(undefined))).rejects.toThrow(LockTimeoutError)

    first.open()
    await running
  })

  it('reports the timeout it gave up after', async () => {
    const writes = lock(IMPATIENT_MS)
    const first = gate()
    const running = writes.run(first.hold)

    await expect(writes.run(immediately(undefined))).rejects.toThrow(/5ms/v)

    first.open()
    await running
  })

  it('never runs the operation of a waiter that timed out', async () => {
    const writes = lock(IMPATIENT_MS)
    const first = gate()
    const ran: string[] = []

    const running = writes.run(first.hold)
    await writes.run(recording(ran, 'abandoned')).catch(() => undefined)

    first.open()
    await running
    await writes.run(immediately(undefined))

    expect(ran).toStrictEqual([])
  })

  it('does not strand a waiter queued behind one that timed out', async () => {
    const writes = lock(IMPATIENT_MS)
    const first = gate()
    const ran: string[] = []

    const running = writes.run(first.hold)
    const abandoned = writes.run(immediately(undefined)).catch(() => undefined)
    const patient = writes.run(recording(ran, 'patient'), GENEROUS_MS)

    await abandoned
    first.open()
    await Promise.all([running, patient])

    expect(ran).toStrictEqual(['patient'])
  })

  it('leaves the lock free once a timed-out waiter is the only one left', async () => {
    const writes = lock(IMPATIENT_MS)
    const first = gate()

    const running = writes.run(first.hold)
    await writes.run(immediately(undefined)).catch(() => undefined)
    first.open()
    await running

    await expect(writes.run(immediately('free'))).resolves.toBe('free')
  })

  it('cancels the timeout of a waiter it granted, so a finished write leaves nothing pending', async () => {
    vi.useFakeTimers()

    try {
      const writes = lock(GENEROUS_MS)
      const first = gate()
      const order: string[] = []

      const running = writes.run(first.hold)
      const queued = writes.run(recording(order, 'queued'))

      first.open()
      await Promise.all([running, queued])

      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes a per-call timeout in place of the default', async () => {
    const writes = lock(GENEROUS_MS)
    const first = gate()
    const running = writes.run(first.hold)

    await expect(writes.run(immediately(undefined), IMPATIENT_MS)).rejects.toThrow(LockTimeoutError)

    first.open()
    await running
  })
})
