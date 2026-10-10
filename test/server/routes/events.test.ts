'use sanity'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { eventRoutes, TestOnly } from '../../../src/server/routes/events.ts'
import { createChanges, type Changes } from '../../../src/server/changes.ts'
import { cast } from '../../cast.ts'
import { givenAsync } from '../../conditions.ts'

const BEATS_AT_ONCE = 1

const STARTING_TICK = 0
const ONE_TICK = 1
const NONE_LEFT = 0

let changes: Changes = createChanges()
let app: Hono = eventRoutes({ changes, buildId: null })
let abort: AbortController = new AbortController()
let reading: Array<ReadableStreamDefaultReader<Uint8Array>> = []

beforeEach(() => {
  changes = createChanges()
  app = eventRoutes({ changes, buildId: null })
  abort = new AbortController()
  reading = []
})

function beatingQuickly(): Hono {
  changes = createChanges()

  return eventRoutes({ changes, buildId: null, heartbeatMs: BEATS_AT_ONCE })
}

function beatingQuicklyOnASteppingClock(): Hono {
  let tick = STARTING_TICK
  changes = createChanges(() => {
    tick += ONE_TICK

    return tick
  })

  return eventRoutes({ changes, buildId: null, heartbeatMs: BEATS_AT_ONCE })
}

async function listeningTo(built: Hono): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await built.request('/', { signal: abort.signal })
  const { body } = response
  if (body === null) throw new Error('the stream has no body')

  const reader = body.getReader()
  reading.push(reader)

  return reader
}

afterEach(async () => {
  abort.abort()
  await Promise.all(
    reading.splice(NONE_LEFT).map(async (reader) => {
      await reader.cancel()
    }),
  )
})

async function listening(): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const reader = await listeningTo(app)
  await nextText(reader)

  return reader
}

function markIn(message: string): string | undefined {
  return /\nid: (?<at>\d+)\n/v.exec(message)?.groups?.at
}

async function nextText(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read()

  return new TextDecoder().decode(value)
}

describe('the stream a client listens on', () => {
  it('answers as a stream of events', async () => {
    const response = await app.request('/', { signal: abort.signal })
    const { body } = response
    if (body === null) throw new Error('the stream has no body')
    reading.push(body.getReader())

    expect(response.headers.get('content-type')).toContain('text/event-stream')
  })

  it('sends a change the store announced', async () => {
    const reader = await listening()

    changes.announce({ path: 'notes.md', kind: 'written' })

    expect(await nextText(reader)).toContain('"path":"notes.md"')
  })

  it('names the event, so a client can listen for just that kind', async () => {
    const reader = await listening()

    changes.announce({ path: 'notes.md', kind: 'written' })

    expect(await nextText(reader)).toContain('event: change')
  })

  it('carries the kind, so a client knows what happened', async () => {
    const reader = await listening()

    changes.announce({ path: 'gone.md', kind: 'removed' })

    expect(await nextText(reader)).toContain('"kind":"removed"')
  })

  it('carries both ends of a move in one event, so they cannot be correlated by timing', async () => {
    const reader = await listening()

    changes.announce({ kind: 'moved', from: 'a.md', to: 'b.md' })

    expect(JSON.parse(/^data: (?<body>.*)$/mv.exec(await nextText(reader))?.groups?.body ?? '{}')).toStrictEqual({
      kind: 'moved',
      from: 'a.md',
      to: 'b.md',
    })
  })

  it('releases its listener once the client has gone, so a closed tab costs nothing', async () => {
    const released: string[] = []
    const watched = createChanges()
    const spying = cast<Changes>({
      announce: watched.announce,
      lastAnnouncedAt: watched.lastAnnouncedAt,
      listen: (hear: Parameters<Changes['listen']>[0]) => {
        const stop = watched.listen(hear)

        return () => {
          released.push('released')
          stop()
        }
      },
    })
    const app = eventRoutes({ changes: spying, buildId: null })
    const { body } = await app.request('/', { signal: abort.signal })
    if (body === null) throw new Error('the stream has no body')

    await body.cancel()

    await expect.poll(() => released).toStrictEqual(['released'])
  })
})

describe('the build the server is serving', () => {
  it('is announced first, so a page can tell at once whether it is stale', async () => {
    const serving = eventRoutes({ changes, buildId: 'built-today' })

    const reader = await listeningTo(serving)

    expect(await nextText(reader)).toContain('built-today')
  })

  it('is left unsaid when the server has no build to name, because unknown is not a mismatch', async () => {
    const reader = await listening()

    changes.announce({ path: 'notes.md', kind: 'written' })

    expect(await nextText(reader)).not.toContain('event: build')
  })
})

describe('a reader whose stream has dropped', () => {
  it('is told how soon to come back, rather than left on the browser’s own long wait', async () => {
    const reader = await listeningTo(app)

    const opening = await nextText(reader)

    expect(opening).toMatch(/\nretry: \d+\n/v)
  })
})

describe('a stream nothing is happening on', () => {
  it('beats, so whatever sits between the server and the reader has traffic to see', async () => {
    const reader = await listeningTo(beatingQuickly())
    await nextText(reader)

    const beat = await nextText(reader)

    expect(beat).toContain('event: heartbeat')
  })

  it('tells the reader how fresh the store is, so a reconnection can tell it missed nothing', async () => {
    const reader = await listeningTo(beatingQuickly())
    await nextText(reader)

    const beat = await nextText(reader)

    expect(beat).toMatch(/\nid: \d+\n/v)
  })

  it('moves that mark on when something is announced, so a gap is visible as a different one', async () => {
    const reader = await listeningTo(beatingQuicklyOnASteppingClock())
    await nextText(reader)
    const before = await nextText(reader)
    changes.announce({ path: 'a.md', kind: 'written' })

    const announced = await nextText(reader)

    expect(markIn(announced)).not.toBe(markIn(before))
  })
})

describe('a stream that is carrying changes', () => {
  it('does not beat as well, because the beat is only there to keep an idle channel open', async () => {
    const reader = await listeningTo(eventRoutes({ changes, buildId: null }))
    await nextText(reader)
    changes.announce({ path: 'a.md', kind: 'written' })

    const after = await nextText(reader)

    expect(after).toContain('event: change')
  })
})

describe('the heartbeat that keeps an idle stream from being dropped', () => {
  const { keepingAlive } = TestOnly
  const AT_ONCE = 0
  const ONE_BEAT = 1
  const NO_BEATS = 0

  interface Counted {
    alive: ReturnType<typeof keepingAlive>
    beats: () => number
  }

  function counting(): Counted {
    let beats = NO_BEATS

    return {
      alive: keepingAlive(AT_ONCE, () => {
        beats += ONE_BEAT
      }),
      beats: () => beats,
    }
  }

  async function afterTheSlotPasses(): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<undefined>()
    const reference = keepingAlive(AT_ONCE, () => {
      resolve(undefined)
    })
    reference.reset()

    await promise
  }

  it('beats once the interval has passed with nothing to say', async () => {
    const counted = counting()
    counted.alive.reset()

    await afterTheSlotPasses()

    expect(counted.beats()).toBe(ONE_BEAT)
  })

  it('beats again after it is armed afresh, so a quiet stream keeps being held open', async () => {
    const counted = counting()
    counted.alive.reset()
    await givenAsync(afterTheSlotPasses())
    counted.alive.reset()

    await afterTheSlotPasses()

    expect(counted.beats()).toBe(ONE_BEAT + ONE_BEAT)
  })

  it('replaces the pending beat rather than letting two of them run', async () => {
    const counted = counting()
    counted.alive.reset()
    counted.alive.reset()

    await afterTheSlotPasses()

    expect(counted.beats()).toBe(ONE_BEAT)
  })

  it('stops beating once the stream is gone, so a closed tab schedules nothing more', async () => {
    const counted = counting()
    counted.alive.reset()
    counted.alive.stop()

    await afterTheSlotPasses()

    expect(counted.beats()).toBe(NO_BEATS)
  })
})
