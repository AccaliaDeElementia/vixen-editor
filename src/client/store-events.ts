'use sanity'

import { API_PREFIX } from '../shared/api.ts'
import { isStoreChange, type StoreChange } from '../shared/store-change.ts'

const CHANGES_URL = `${API_PREFIX}/events`
const CHANGE_EVENT = 'change'
const OPEN_EVENT = 'open'
const BUILD_EVENT = 'build'
const HEARTBEAT_EVENT = 'heartbeat'
const SYNC_EVENT = 'sync'

interface ChangesOptions {
  onChange: (change: StoreChange) => void
  onConnected: () => void
  onStale: () => void
  onBuild: (serving: string) => void
  open?: ((url: string) => EventSource) | undefined
}

interface ChangesChannel {
  disconnect: () => void
}

function wasAway(seenBefore: string | null, saysNow: string): boolean {
  return seenBefore !== null && seenBefore !== saysNow
}

function announced(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

export function connectToChanges(options: ChangesOptions): ChangesChannel {
  const open = options.open ?? ((url: string) => new EventSource(url))
  const source = open(CHANGES_URL)
  let storeWasAt: string | null = null

  const hear = (event: MessageEvent<string>): void => {
    const { lastEventId, data } = event
    storeWasAt = lastEventId
    const change = announced(data)
    if (isStoreChange(change)) options.onChange(change)
  }

  const beat = (event: MessageEvent<string>): void => {
    const { lastEventId } = event
    storeWasAt = lastEventId
  }

  const resynced = (event: MessageEvent<string>): void => {
    const { lastEventId } = event
    const missedSomething = wasAway(storeWasAt, lastEventId)

    storeWasAt = lastEventId
    if (missedSomething) options.onStale()
  }

  const connected = (): void => {
    options.onConnected()
  }

  const built = (event: MessageEvent<string>): void => {
    options.onBuild(event.data)
  }

  source.addEventListener(CHANGE_EVENT, hear)
  source.addEventListener(HEARTBEAT_EVENT, beat)
  source.addEventListener(SYNC_EVENT, resynced)
  source.addEventListener(OPEN_EVENT, connected)
  source.addEventListener(BUILD_EVENT, built)

  return {
    disconnect: () => {
      source.removeEventListener(CHANGE_EVENT, hear)
      source.removeEventListener(HEARTBEAT_EVENT, beat)
      source.removeEventListener(SYNC_EVENT, resynced)
      source.removeEventListener(OPEN_EVENT, connected)
      source.removeEventListener(BUILD_EVENT, built)
      source.close()
    },
  }
}
