'use sanity'

import { readPreferences, writePreferences, type ExplorerPreferences } from './preferences.ts'

export const MIN_EXPLORER_PX = 160
const MIN_EDITOR_PX = 672
const DEFAULT_EXPLORER_PX = 320
export const MAX_EXPLORER_FRACTION = 0.8

const APP_SELECTOR = '#app'
export const EXPLORER_SELECTOR = '#explorer'
export const TOGGLE_SELECTOR = '#toggle-explorer'
export const RESIZER_SELECTOR = '#explorer-resizer'

function clampExplorerWidth(requestedPx: number, viewportPx: number): number {
  const maxPx = viewportPx * MAX_EXPLORER_FRACTION
  return Math.min(Math.max(requestedPx, MIN_EXPLORER_PX), maxPx)
}

function readExplorerState(viewportPx: number): ExplorerPreferences {
  const stored = readPreferences()
  if (stored.widthPx === null) return stored

  return { ...stored, widthPx: clampExplorerWidth(stored.widthPx, viewportPx) }
}

export function setExplorerWidth(px: number, viewportPx: number): void {
  writePreferences({ ...readPreferences(), widthPx: clampExplorerWidth(px, viewportPx) })
}

function setExplorerOpen(open: boolean): void {
  writePreferences({ ...readPreferences(), open })
}

function decideOpen(stored: boolean, cramped: boolean, wasCramped: boolean | null): boolean {
  const justBecameCramped = cramped && wasCramped !== true

  return justBecameCramped ? false : stored
}

export function toggleExplorer(root: ParentNode): boolean {
  const next = root.querySelector<HTMLElement>(APP_SELECTOR)?.dataset.explorer === 'closed'

  setExplorerOpen(next)

  return next
}

const NO_STORED_WIDTH = 0

function rememberedFlag(value: string | undefined): boolean | null {
  return value === undefined ? null : value === 'true'
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
  const cramped = viewportPx < DEFAULT_EXPLORER_PX + MIN_EDITOR_PX
  const open = decideOpen(state.open, cramped, rememberedFlag(app.dataset.explorerCramped))

  app.dataset.explorerCramped = String(cramped)
  app.dataset.explorer = open ? 'open' : 'closed'

  const toggle = root.querySelector(TOGGLE_SELECTOR)
  toggle?.setAttribute('aria-expanded', String(open))
  toggle?.setAttribute('aria-pressed', String(open))

  if (state.widthPx === null) {
    app.style.removeProperty('--explorer-width')
    describeWidth(root, NO_STORED_WIDTH, viewportPx)
    return
  }

  applyExplorerWidth(root, state.widthPx, viewportPx)
}

export const TestOnly = { clampExplorerWidth, decideOpen, readExplorerState, setExplorerOpen }
