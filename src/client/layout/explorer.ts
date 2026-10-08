'use sanity'

import { readPreferences, writePreferences, type ExplorerPreferences } from '../preferences.ts'
import { choosePanel, PANEL_CONTROL_SELECTOR, panelShowing, showPanel } from '../panels.ts'

export const MIN_EXPLORER_PX = 160
const MIN_EDITOR_PX = 672
const DEFAULT_EXPLORER_PX = 320
const COLLAPSED_BY_WIDTH = 'collapsed'
export const MAX_EXPLORER_FRACTION = 0.8

const APP_SELECTOR = '#app'
export const EXPLORER_SELECTOR = '#explorer'
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

interface Collapse {
  open: boolean
  auto: boolean
}

function decideOpen(stored: boolean, cramped: boolean, wasCramped: boolean | null, auto: boolean): Collapse {
  if (cramped && wasCramped !== true) return { open: false, auto: stored }
  if (cramped && auto) return { open: false, auto: true }
  if (!cramped && auto) return { open: true, auto: false }

  return { open: stored, auto: false }
}

export function askForPanel(root: ParentNode, wanted: string): boolean {
  const app = root.querySelector<HTMLElement>(APP_SELECTOR)
  const { panel, open } = choosePanel({
    wanted,
    showing: panelShowing(root),
    open: app?.dataset.explorer !== 'closed',
  })

  if (app !== null) delete app.dataset.explorerAuto

  writePreferences({ ...readPreferences(), open, panel })

  return open
}

export function closeExplorerWhenCramped(root: ParentNode): boolean {
  const app = root.querySelector<HTMLElement>(APP_SELECTOR)
  if (app?.dataset.explorerCramped !== 'true') return false

  delete app.dataset.explorerAuto
  setExplorerOpen(false)

  return true
}

const NO_STORED_WIDTH = 0

function rememberedFlag(value: string | undefined): boolean | null {
  return value === undefined ? null : value === 'true'
}

function describeWidth(root: ParentNode, widthPx: number, viewportPx: number): void {
  const resizer = root.querySelector(RESIZER_SELECTOR)
  if (resizer === null) return

  const across = Math.round(widthPx)

  resizer.setAttribute('aria-valuenow', String(across))
  resizer.setAttribute('aria-valuemin', String(MIN_EXPLORER_PX))
  resizer.setAttribute('aria-valuemax', String(viewportPx * MAX_EXPLORER_FRACTION))
  resizer.setAttribute('aria-valuetext', `${String(across)} pixels`)
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
  const { open, auto } = decideOpen(
    state.open,
    cramped,
    rememberedFlag(app.dataset.explorerCramped),
    app.dataset.explorerAuto === COLLAPSED_BY_WIDTH,
  )

  if (auto) app.dataset.explorerAuto = COLLAPSED_BY_WIDTH
  else delete app.dataset.explorerAuto

  app.dataset.explorerCramped = String(cramped)
  app.dataset.explorer = open ? 'open' : 'closed'

  showPanel(root, state.panel)
  for (const control of root.querySelectorAll<HTMLElement>(PANEL_CONTROL_SELECTOR)) {
    const up = open && control.dataset.showsPanel === state.panel
    control.setAttribute('aria-expanded', String(up))
    control.setAttribute('aria-pressed', String(up))
  }

  if (state.widthPx === null) {
    app.style.removeProperty('--explorer-width')
    describeWidth(root, NO_STORED_WIDTH, viewportPx)
    return
  }

  applyExplorerWidth(root, state.widthPx, viewportPx)
}

export const TestOnly = { clampExplorerWidth, decideOpen, readExplorerState, setExplorerOpen }
