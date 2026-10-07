'use sanity'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../../src/server/app.ts'
import { createChanges, type Changes } from '../../../src/server/changes.ts'
import { cast } from '../../cast.ts'
import type { DocumentStore } from '../../../src/server/storage/fs-store.ts'

const BEATS_AT_ONCE = 1
const NONE_LEFT = 0

let changes: Changes = createChanges()
let app: Hono = buildApp({ store: cast<DocumentStore>({}), changes })
let abort: AbortController = new AbortController()
let reading: Array<ReadableStreamDefaultReader<Uint8Array>> = []

beforeEach(() => {
  changes = createChanges()
  app = buildApp({ store: cast<DocumentStore>({}), changes })
  abort = new AbortController()
  reading = []
})

function beatingQuickly(): Hono {
  changes = createChanges()

  return buildApp({ store: cast<DocumentStore>({}), changes, heartbeatMs: BEATS_AT_ONCE })
}

async function listeningTo(built: Hono): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await built.request('/api/events', { signal: abort.signal })
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

describe('GET /api/events', () => {
  it('answers as a stream of events', async () => {
    const response = await app.request('/api/events', { signal: abort.signal })
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
    const app = buildApp({ store: cast<DocumentStore>({}), changes: spying })
    const { body } = await app.request('/api/events', { signal: abort.signal })
    if (body === null) throw new Error('the stream has no body')

    await body.cancel()

    await expect.poll(() => released).toStrictEqual(['released'])
  })
})

describe('the build the server is serving', () => {
  it('is announced first, so a page can tell at once whether it is stale', async () => {
    const serving = buildApp({ store: cast<DocumentStore>({}), changes, buildId: 'built-today' })

    const reader = await listeningTo(serving)

    expect(await nextText(reader)).toContain('built-today')
  })

  it('is left unsaid when the server has no build to name, because unknown is not a mismatch', async () => {
    const reader = await listening()

    changes.announce({ path: 'notes.md', kind: 'written' })

    expect(await nextText(reader)).not.toContain('event: build')
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
    const reader = await listeningTo(beatingQuickly())
    await nextText(reader)
    const before = await nextText(reader)
    changes.announce({ path: 'a.md', kind: 'written' })

    const announced = await nextText(reader)

    expect(markIn(announced)).not.toBe(markIn(before))
  })
})

describe('a stream that is carrying changes', () => {
  it('does not beat as well, because the beat is only there to keep an idle channel open', async () => {
    const reader = await listeningTo(buildApp({ store: cast<DocumentStore>({}), changes }))
    await nextText(reader)
    changes.announce({ path: 'a.md', kind: 'written' })

    const after = await nextText(reader)

    expect(after).toContain('event: change')
  })
})
