'use sanity'

import { API_PREFIX } from '../shared/api.ts'
import { isStoreChange, type StoreChange } from '../shared/store-change.ts'

const CHANGES_URL = `${API_PREFIX}/events`
const CHANGE_EVENT = 'change'
const OPEN_EVENT = 'open'
const BUILD_EVENT = 'build'

interface ChangesOptions {
  onChange: (change: StoreChange) => void
  onConnected: () => void
  onBuild: (serving: string) => void
  open?: ((url: string) => EventSource) | undefined
}

interface ChangesChannel {
  disconnect: () => void
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

  const hear = (event: MessageEvent<string>): void => {
    const change = announced(event.data)
    if (isStoreChange(change)) options.onChange(change)
  }

  const connected = (): void => {
    options.onConnected()
  }

  const built = (event: MessageEvent<string>): void => {
    options.onBuild(event.data)
  }

  source.addEventListener(CHANGE_EVENT, hear)
  source.addEventListener(OPEN_EVENT, connected)
  source.addEventListener(BUILD_EVENT, built)

  return {
    disconnect: () => {
      source.removeEventListener(CHANGE_EVENT, hear)
      source.removeEventListener(OPEN_EVENT, connected)
      source.removeEventListener(BUILD_EVENT, built)
      source.close()
    },
  }
}
