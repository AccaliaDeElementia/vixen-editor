'use sanity'

import { isRecord } from '../../shared/guards.ts'
import { readJson, writeJson } from '../local-storage.ts'
import { TAB_VIEWS, type TabAt } from './open-tabs.ts'

const KEPT_TABS_KEY = 'vixen-editor:tabs'
const NO_PATH = ''

function isTabAt(value: unknown): value is TabAt {
  if (!isRecord(value)) return false

  const { path, view } = value

  return typeof path === 'string' && path !== NO_PATH && TAB_VIEWS.some((candidate) => candidate === view)
}

export function readKeptTabs(storage?: Storage | null): TabAt[] {
  const stored = readJson(KEPT_TABS_KEY, storage)

  return Array.isArray(stored) ? stored.filter(isTabAt).map(({ path, view }) => ({ path, view })) : []
}

export function writeKeptTabs(tabs: readonly TabAt[], storage?: Storage | null): void {
  writeJson(KEPT_TABS_KEY, tabs, storage)
}

export const TestOnly = { KEPT_TABS_KEY }
