'use sanity'

import { stringsIn } from './json.ts'
import { readJson, writeJson } from './local-storage.ts'
import { isRecord } from '../shared/guards.ts'

const PREFERENCES_KEY = 'vixen-editor:explorer'

export interface ExplorerPreferences {
  widthPx: number | null
  open: boolean
  openFolders: string[]
}

const DEFAULT_PREFERENCES: ExplorerPreferences = { widthPx: null, open: true, openFolders: [] }

const NO_WIDTH = 0

function widthFrom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > NO_WIDTH ? value : null
}

export function readPreferences(storage?: Storage | null): ExplorerPreferences {
  const value = readJson(PREFERENCES_KEY, storage)
  if (!isRecord(value) || typeof value.open !== 'boolean') return DEFAULT_PREFERENCES

  return { widthPx: widthFrom(value.widthPx), open: value.open, openFolders: stringsIn(value.openFolders) }
}

export function writePreferences(preferences: ExplorerPreferences, storage?: Storage | null): void {
  writeJson(PREFERENCES_KEY, preferences, storage)
}

export const TestOnly = { DEFAULT_PREFERENCES, PREFERENCES_KEY }
