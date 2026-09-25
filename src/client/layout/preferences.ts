'use sanity'

import { stringsIn } from '../json.ts'
import { isRecord } from '../../shared/guards.ts'

const PREFERENCES_KEY = 'vixen-editor:explorer'

export interface ExplorerPreferences {
  widthPx: number | null
  open: boolean
  openFolders: string[]
}

const DEFAULT_PREFERENCES: ExplorerPreferences = { widthPx: null, open: true, openFolders: [] }

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function widthFrom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function parse(raw: string): ExplorerPreferences {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value) || typeof value.open !== 'boolean') return DEFAULT_PREFERENCES

  return { widthPx: widthFrom(value.widthPx), open: value.open, openFolders: stringsIn(value.openFolders) }
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
  } catch {}
}

export const TestOnly = { DEFAULT_PREFERENCES, PREFERENCES_KEY }
