'use sanity'

import {
  applyExplorerState,
  applyExplorerWidth,
  closeExplorerWhenCramped,
  EXPLORER_SELECTOR,
  MAX_EXPLORER_FRACTION,
  MIN_EXPLORER_PX,
  RESIZER_SELECTOR,
  setExplorerWidth,
  askForPanel,
} from './explorer.ts'
import { PANEL_NAMES } from '../panels.ts'
import {
  applySplit,
  setSplitFraction,
  showSplitFraction,
  toggleSplit,
  readSplit,
  type SplitOrientation,
} from './split.ts'
import { announceSplitChanged, onSplitChanged, requestSplitDismissed } from '../split-changed.ts'
import { announcePanelChanged } from '../panel-changed.ts'
import { createDialogs } from '../files/dialogs.ts'
import { HELP_SECTIONS, KEYS } from '../help.ts'
import { onInsertRequested } from '../insert-entry.ts'

const HELP_SELECTOR = '#show-help'
const PANES_SELECTOR = '[data-part="panes"]'
const SPLIT_RESIZER_SELECTOR = '[data-part="split-resizer"]'
const SPLIT_BUTTONS: ReadonlyArray<readonly [string, SplitOrientation]> = [
  ['#split-beside', 'beside'],
  ['#split-below', 'below'],
]
const SPLIT_STEP = 0.05
const NO_SPLIT = 0
const WHOLE = 1

const KEYBOARD_STEP_PX = 16

interface LayoutOptions {
  root?: ParentNode
  view?: Window
}

interface DragHandlers {
  show: (event: PointerEvent) => void
  settle: (event: PointerEvent) => void
}

function bindDragging(resizer: HTMLElement, handlers: DragHandlers): void {
  let dragging = false

  resizer.addEventListener('pointerdown', (event: PointerEvent) => {
    dragging = true
    resizer.setPointerCapture(event.pointerId)
    event.preventDefault()
  })

  resizer.addEventListener('pointermove', (event: PointerEvent) => {
    if (dragging) handlers.show(event)
  })

  resizer.addEventListener('pointerup', (event: PointerEvent) => {
    if (!dragging) return

    dragging = false
    resizer.releasePointerCapture(event.pointerId)
    handlers.settle(event)
  })

  resizer.addEventListener('pointercancel', (event: PointerEvent) => {
    if (!dragging) return

    dragging = false
    handlers.settle(event)
  })
}

function widthFromPointer(explorer: Element, clientX: number): number {
  return clientX - explorer.getBoundingClientRect().left
}

function bindResizer(root: ParentNode, view: Window): void {
  const resizer = root.querySelector<HTMLElement>(RESIZER_SELECTOR)
  const explorer = root.querySelector<HTMLElement>(EXPLORER_SELECTOR)
  if (resizer === null || explorer === null) return

  bindDragging(resizer, {
    show: (event: PointerEvent) => {
      applyExplorerWidth(root, widthFromPointer(explorer, event.clientX), view.innerWidth)
    },
    settle: (event: PointerEvent) => {
      setExplorerWidth(widthFromPointer(explorer, event.clientX), view.innerWidth)
      applyExplorerState(root, view.innerWidth)
    },
  })

  resizer.addEventListener('keydown', (event: KeyboardEvent) => {
    const { width: current } = explorer.getBoundingClientRect()
    const maxPx = view.innerWidth * MAX_EXPLORER_FRACTION
    const next = keyboardWidth(event.key, current, maxPx)
    if (next === null) return

    event.preventDefault()
    setExplorerWidth(next, view.innerWidth)
    applyExplorerState(root, view.innerWidth)
  })
}

function keyboardWidth(key: string, currentPx: number, maxPx: number): number | null {
  if (key === KEYS.narrower) return currentPx - KEYBOARD_STEP_PX
  if (key === KEYS.wider) return currentPx + KEYBOARD_STEP_PX
  if (key === KEYS.narrowest) return MIN_EXPLORER_PX
  if (key === KEYS.widest) return maxPx
  return null
}

function bindToggle(root: ParentNode, view: Window): void {
  for (const name of PANEL_NAMES) {
    root.querySelector<HTMLElement>(`[data-shows-panel="${name}"]`)?.addEventListener('click', () => {
      askForPanel(root, name)
      applyExplorerState(root, view.innerWidth)
      announcePanelChanged(root)
    })
  }
}

function bindHelp(root: ParentNode): void {
  const help = root.querySelector<HTMLElement>(HELP_SELECTOR)
  if (help === null) return

  const dialogs = createDialogs(root)

  help.addEventListener('click', () => {
    void dialogs.inform({ title: 'Help', closeLabel: 'Close', sections: HELP_SECTIONS })
  })
}

function bindDrawerDismissal(root: ParentNode, view: Window): () => void {
  const { offInsertRequested } = onInsertRequested(root, () => {
    if (closeExplorerWhenCramped(root)) applyExplorerState(root, view.innerWidth)
  })

  return offInsertRequested
}

function bindViewportResize(root: ParentNode, view: Window): () => void {
  const onResize = (): void => {
    applyExplorerState(root, view.innerWidth)
    refreshSplit(root)
  }

  view.addEventListener('resize', onResize)

  return () => {
    view.removeEventListener('resize', onResize)
  }
}

function refreshSplit(root: ParentNode): void {
  const panes = root.querySelector<HTMLElement>(PANES_SELECTOR)

  applySplit(root, panes === null ? NO_SPLIT : axisOf(panes))
}

function axisOf(panes: HTMLElement): number {
  const { width, height } = panes.getBoundingClientRect()

  return readSplit().orientation === 'below' ? height : width
}

function fractionFromPointer(panes: HTMLElement, event: PointerEvent): number {
  const { left, top, width, height } = panes.getBoundingClientRect()
  const along = readSplit().orientation === 'below' ? event.clientY - top : event.clientX - left
  const axis = readSplit().orientation === 'below' ? height : width

  return axis === NO_SPLIT ? NO_SPLIT : along / axis
}

function reflectSplitButtons(root: ParentNode): void {
  const { orientation } = readSplit()

  for (const [selector, candidate] of SPLIT_BUTTONS) {
    root.querySelector(selector)?.setAttribute('aria-pressed', String(orientation === candidate))
  }
}

function bindSplitButtons(root: ParentNode): void {
  for (const [selector, orientation] of SPLIT_BUTTONS) {
    root.querySelector<HTMLElement>(selector)?.addEventListener('click', () => {
      if (readSplit().orientation === orientation) {
        requestSplitDismissed(root)

        return
      }

      const panes = root.querySelector<HTMLElement>(PANES_SELECTOR)
      toggleSplit(root, orientation, panes === null ? NO_SPLIT : axisOf(panes))
      reflectSplitButtons(root)
      announceSplitChanged(root)
    })
  }
}

function steppedFraction(key: string, current: number): number | null {
  if (key === KEYS.narrower) return current - SPLIT_STEP
  if (key === KEYS.wider) return current + SPLIT_STEP
  if (key === KEYS.narrowest) return NO_SPLIT
  if (key === KEYS.widest) return WHOLE

  return null
}

function bindSplitResizer(root: ParentNode): void {
  const resizer = root.querySelector<HTMLElement>(SPLIT_RESIZER_SELECTOR)
  const panes = root.querySelector<HTMLElement>(PANES_SELECTOR)
  if (resizer === null || panes === null) return

  bindDragging(resizer, {
    show: (event: PointerEvent) => {
      showSplitFraction({ panes, resizer }, fractionFromPointer(panes, event), axisOf(panes))
    },
    settle: (event: PointerEvent) => {
      setSplitFraction(root, fractionFromPointer(panes, event), axisOf(panes))
    },
  })

  resizer.addEventListener('keydown', (event: KeyboardEvent) => {
    const next = steppedFraction(event.key, readSplit().fraction)
    if (next === null) return

    event.preventDefault()
    setSplitFraction(root, next, axisOf(panes))
  })
}

interface Layout {
  teardownLayout: () => void
}

export function initLayout(options: LayoutOptions = {}): Layout {
  const root = options.root ?? document
  const view = options.view ?? window

  applyExplorerState(root, view.innerWidth)
  refreshSplit(root)
  reflectSplitButtons(root)
  bindSplitButtons(root)
  const { offSplitChanged } = onSplitChanged(root, () => {
    refreshSplit(root)
    reflectSplitButtons(root)
  })
  bindSplitResizer(root)
  bindResizer(root, view)
  bindToggle(root, view)
  bindHelp(root)
  const offInsertRequested = bindDrawerDismissal(root, view)
  const offResize = bindViewportResize(root, view)

  return {
    teardownLayout: () => {
      offInsertRequested()
      offResize()
      offSplitChanged()
    },
  }
}

export const TestOnly = { KEYBOARD_STEP_PX }
