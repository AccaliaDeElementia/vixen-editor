'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { connectToChanges } from '../../src/client/store-events.ts'
import type { StoreChange } from '../../src/shared/store-change.ts'
import { cast } from '../cast.ts'

const WRITTEN = { kind: 'written', path: 'journal/a.md' } as const
const ONE_RESYNC = 1
const NO_RESYNCS = 0

interface FakeChannel {
  source: EventSource
  openedAt: string[]
  deliver: (type: string, data: string, lastEventId?: string) => void
  listenerCount: () => number
  closed: () => number
}

function fakeChannel(): FakeChannel {
  const listeners = new Map<string, Set<(event: unknown) => void>>()
  const openedAt: string[] = []
  let closes = 0

  const source = cast<EventSource>({
    addEventListener: (type: string, handle: (event: unknown) => void) => {
      const forType = listeners.get(type) ?? new Set()
      forType.add(handle)
      listeners.set(type, forType)
    },
    removeEventListener: (type: string, handle: (event: unknown) => void) => {
      listeners.get(type)?.delete(handle)
    },
    close: () => {
      closes += 1
    },
  })

  return {
    source,
    openedAt,
    deliver: (type: string, data: string, lastEventId = '') => {
      for (const handle of listeners.get(type) ?? []) handle({ data, lastEventId })
    },
    listenerCount: () => [...listeners.values()].reduce((total, forType) => total + forType.size, 0),
    closed: () => closes,
  }
}

let channel: FakeChannel = fakeChannel()
let heard: StoreChange[] = []
let builds: string[] = []
let connections = 0
let resyncs = 0

function connect(): { disconnect: () => void } {
  return connectToChanges({
    onStale: () => {
      resyncs += 1
    },
    onChange: (change) => {
      heard.push(change)
    },
    onConnected: () => {
      connections += 1
    },
    onBuild: (serving: string) => {
      builds.push(serving)
    },
    open: (url: string) => {
      channel.openedAt.push(url)

      return channel.source
    },
  })
}

beforeEach(() => {
  builds = []
  channel = fakeChannel()
  heard = []
  connections = 0
  resyncs = 0
})

describe('listening for what the server changed', () => {
  it('opens the channel the server serves', () => {
    connect()

    expect(channel.openedAt).toStrictEqual(['/api/events'])
  })

  it('passes on a change the server announced', () => {
    connect()

    channel.deliver('change', JSON.stringify(WRITTEN))

    expect(heard).toStrictEqual([WRITTEN])
  })

  it('ignores a message that is not a change this build understands', () => {
    connect()

    channel.deliver('change', JSON.stringify({ kind: 'renamed', path: 'a.md' }))

    expect(heard).toStrictEqual([])
  })

  it('ignores a message that is not JSON at all, rather than failing the page', () => {
    connect()

    channel.deliver('change', 'not json')

    expect(heard).toStrictEqual([])
  })

  it('says so when the channel opens, which is when a client must re-sync', () => {
    connect()

    channel.deliver('open', '')

    expect(connections).toBe(1)
  })

  it('says so again when it reconnects, because changes during the gap were lost', () => {
    connect()

    channel.deliver('open', '')
    channel.deliver('open', '')

    expect(connections).toBe(2)
  })
})

describe('letting the channel go', () => {
  it('closes the connection', () => {
    connect().disconnect()

    expect(channel.closed()).toBe(1)
  })

  it('leaves no listener behind', () => {
    connect().disconnect()

    expect(channel.listenerCount()).toBe(0)
  })

  it('stops passing changes on', () => {
    connect().disconnect()

    channel.deliver('change', JSON.stringify(WRITTEN))

    expect(heard).toStrictEqual([])
  })
})

describe('the build the server is serving', () => {
  it('arrives on the channel, so the page can tell it has gone stale', () => {
    connect()

    channel.deliver('build', 'build-one')

    expect(builds).toStrictEqual(['build-one'])
  })

  it('stops arriving once the channel is let go', () => {
    const { disconnect } = connect()
    disconnect()

    channel.deliver('build', 'build-one')

    expect(builds).toStrictEqual([])
  })
})

describe('a connection that comes back after a gap', () => {
  it('says everything it holds is stale when the store moved on while it was away', () => {
    connect()
    channel.deliver('sync', '', '100')

    channel.deliver('sync', '', '140')

    expect(resyncs).toBe(ONE_RESYNC)
  })

  it('says nothing of the sort when the store is where it left it', () => {
    connect()
    channel.deliver('sync', '', '100')

    channel.deliver('sync', '', '100')

    expect(resyncs).toBe(NO_RESYNCS)
  })

  it('says nothing on the first connection, because there is nothing yet to be stale', () => {
    connect()

    channel.deliver('sync', '', '100')

    expect(resyncs).toBe(NO_RESYNCS)
  })

  it('counts a heartbeat as having been there, so a quiet connection is not read as a gap', () => {
    connect()
    channel.deliver('sync', '', '100')
    channel.deliver('heartbeat', '', '140')

    channel.deliver('sync', '', '140')

    expect(resyncs).toBe(NO_RESYNCS)
  })
})
