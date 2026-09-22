'use sanity'

export const PREFERENCES_KEY = 'vixen-editor:explorer'

export interface ExplorerPreferences {
  widthPx: number | null
  open: boolean
}

export const DEFAULT_PREFERENCES: ExplorerPreferences = { widthPx: null, open: true }

// Touching localStorage throws outright when site data is blocked, so even
// reaching for it has to be guarded.
function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function widthFrom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function parse(raw: string): ExplorerPreferences {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value) || typeof value.open !== 'boolean') return DEFAULT_PREFERENCES

  return { widthPx: widthFrom(value.widthPx), open: value.open }
}

export function readPreferences(storage: Storage | null = defaultStorage()): ExplorerPreferences {
  if (storage === null) return DEFAULT_PREFERENCES

  try {
    const raw = storage.getItem(PREFERENCES_KEY)
    return raw === null ? DEFAULT_PREFERENCES : parse(raw)
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function writePreferences(preferences: ExplorerPreferences, storage: Storage | null = defaultStorage()): void {
  if (storage === null) return

  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
  } catch {
    // A blocked or full quota costs a remembered width, not a working editor.
  }
}
