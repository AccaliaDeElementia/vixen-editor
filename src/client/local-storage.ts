'use sanity'

function availableStorage(): Storage | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

export function readJson(key: string, storage: Storage | null = availableStorage()): unknown {
  if (storage === null) return null

  try {
    const raw = storage.getItem(key)
    if (raw === null) return null

    const parsed: unknown = JSON.parse(raw)

    return parsed
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown, storage: Storage | null = availableStorage()): void {
  if (storage === null) return

  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {}
}
