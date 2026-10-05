'use sanity'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../../src/server/app.ts'
import { createChanges, type Changes } from '../../../src/server/changes.ts'
import { cast } from '../../cast.ts'
import type { DocumentStore } from '../../../src/server/storage/fs-store.ts'

let changes: Changes = createChanges()
let app: Hono = buildApp({ store: cast<DocumentStore>({}), changes })
let abort: AbortController = new AbortController()

beforeEach(() => {
  changes = createChanges()
  app = buildApp({ store: cast<DocumentStore>({}), changes })
  abort = new AbortController()
})

afterEach(() => {
  abort.abort()
})

async function listening(): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await app.request('/api/events', { signal: abort.signal })
  const { body } = response
  if (body === null) throw new Error('the stream has no body')

  return body.getReader()
}

async function nextText(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read()

  return new TextDecoder().decode(value)
}

describe('GET /api/events', () => {
  it('answers as a stream of events', async () => {
    const response = await app.request('/api/events', { signal: abort.signal })

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

    expect(JSON.parse((await nextText(reader)).split('data: ')[1] ?? '{}')).toStrictEqual({
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
