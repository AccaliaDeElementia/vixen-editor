'use sanity'

import { isRecord } from '../../shared/guards.ts'
import { readJson, writeJson } from '../local-storage.ts'
import { TAB_VIEWS } from '../doc-path.ts'
import type { TabAt } from './open-tabs.ts'

export type PaneId = 'primary' | 'secondary'

const KEPT_TABS_PREFIX = 'vixen-editor:tabs'

function keyFor(pane: PaneId): string {
  return `${KEPT_TABS_PREFIX}:${pane}`
}
const NO_PATH = ''

function isTabAt(value: unknown): value is TabAt {
  if (!isRecord(value)) return false

  const { path, view } = value

  return typeof path === 'string' && path !== NO_PATH && TAB_VIEWS.some((candidate) => candidate === view)
}

interface KeptTabs {
  tabs: TabAt[]
  active: TabAt | null
}

function tabsIn(stored: unknown): TabAt[] {
  return Array.isArray(stored) ? stored.filter(isTabAt).map(({ path, view }) => ({ path, view })) : []
}

export function readKeptTabs(pane: PaneId, storage?: Storage | null): KeptTabs {
  const stored = readJson(keyFor(pane), storage)
  if (!isRecord(stored)) return { tabs: tabsIn(stored), active: null }

  const { tabs, active } = stored

  return { tabs: tabsIn(tabs), active: isTabAt(active) ? { path: active.path, view: active.view } : null }
}

export function writeKeptTabs(
  pane: PaneId,
  tabs: readonly TabAt[],
  active: TabAt | null,
  storage?: Storage | null,
): void {
  writeJson(keyFor(pane), { tabs, active }, storage)
}

export const TestOnly = { keyFor }
