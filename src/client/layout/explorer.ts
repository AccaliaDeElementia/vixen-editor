'use sanity'

import { readPreferences, writePreferences, type ExplorerPreferences } from './preferences.ts'

export const MIN_EXPLORER_PX = 160
export const MAX_EXPLORER_FRACTION = 0.8

export const APP_SELECTOR = '#app'
export const EXPLORER_SELECTOR = '#explorer'
export const TOGGLE_SELECTOR = '#toggle-explorer'
export const RESIZER_SELECTOR = '#explorer-resizer'

export function clampExplorerWidth(requestedPx: number, viewportPx: number): number {
  const maxPx = viewportPx * MAX_EXPLORER_FRACTION
  return Math.min(Math.max(requestedPx, MIN_EXPLORER_PX), maxPx)
}

export function readExplorerState(viewportPx: number): ExplorerPreferences {
  const stored = readPreferences()
  if (stored.widthPx === null) return stored

  return { widthPx: clampExplorerWidth(stored.widthPx, viewportPx), open: stored.open }
}

export function setExplorerWidth(px: number, viewportPx: number): void {
  const current = readPreferences()
  writePreferences({ widthPx: clampExplorerWidth(px, viewportPx), open: current.open })
}

export function setExplorerOpen(open: boolean): void {
  const current = readPreferences()
  writePreferences({ widthPx: current.widthPx, open })
}

export function toggleExplorer(): boolean {
  const next = !readPreferences().open
  setExplorerOpen(next)
  return next
}

function describeWidth(root: ParentNode, widthPx: number, viewportPx: number): void {
  const resizer = root.querySelector(RESIZER_SELECTOR)
  if (resizer === null) return

  resizer.setAttribute('aria-valuenow', String(Math.round(widthPx)))
  resizer.setAttribute('aria-valuemin', String(MIN_EXPLORER_PX))
  resizer.setAttribute('aria-valuemax', String(viewportPx * MAX_EXPLORER_FRACTION))
}

export function applyExplorerWidth(root: ParentNode, px: number, viewportPx: number): void {
  const app = root.querySelector<HTMLElement>(APP_SELECTOR)
  if (app === null) return

  const clamped = clampExplorerWidth(px, viewportPx)
  app.style.setProperty('--explorer-width', `${String(clamped)}px`)
  describeWidth(root, clamped, viewportPx)
}

export function applyExplorerState(root: ParentNode, viewportPx: number): void {
  const app = root.querySelector<HTMLElement>(APP_SELECTOR)
  if (app === null) return

  const state = readExplorerState(viewportPx)

  app.dataset.explorer = state.open ? 'open' : 'closed'

  const toggle = root.querySelector(TOGGLE_SELECTOR)
  toggle?.setAttribute('aria-expanded', String(state.open))
  toggle?.setAttribute('aria-pressed', String(state.open))

  if (state.widthPx === null) {
    app.style.removeProperty('--explorer-width')
    describeWidth(root, 0, viewportPx)
    return
  }

  applyExplorerWidth(root, state.widthPx, viewportPx)
}
