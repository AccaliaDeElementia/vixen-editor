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
import { PANEL_NAMES } from '../platform/panels.ts'
import { bindDragging } from '../platform/dragging.ts'
import { bindSplitControls } from '../workspace/split-controls.ts'
import { announcePanelChanged } from '../platform/announce/panel-changed.ts'
import { createDialogs } from '../platform/dialogs.ts'
import { HELP_SECTIONS, KEYS } from '../platform/help.ts'
import { onInsertRequested } from '../platform/announce/insert-entry.ts'

const HELP_SELECTOR = '#show-help'

const KEYBOARD_STEP_PX = 16

interface LayoutOptions {
  root?: ParentNode
  view?: Window
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

function bindViewportResize(root: ParentNode, view: Window, refreshSplit: () => void): () => void {
  const onResize = (): void => {
    applyExplorerState(root, view.innerWidth)
    refreshSplit()
  }

  view.addEventListener('resize', onResize)

  return () => {
    view.removeEventListener('resize', onResize)
  }
}

interface Layout {
  teardownLayout: () => void
}

export function initLayout(options: LayoutOptions = {}): Layout {
  const root = options.root ?? document
  const view = options.view ?? window

  applyExplorerState(root, view.innerWidth)
  const split = bindSplitControls(root)
  bindResizer(root, view)
  bindToggle(root, view)
  bindHelp(root)
  const offInsertRequested = bindDrawerDismissal(root, view)
  const offResize = bindViewportResize(root, view, split.refresh)

  return {
    teardownLayout: () => {
      offInsertRequested()
      offResize()
      split.release()
    },
  }
}

export const TestOnly = { KEYBOARD_STEP_PX }
