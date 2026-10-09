'use sanity'

import { KEYS } from '../platform/help.ts'
import { announceSplitChanged, onSplitChanged, requestSplitDismissed } from '../platform/split-changed.ts'
import { bindDragging } from '../platform/dragging.ts'

import {
  applySplit,
  readSplit,
  setSplitFraction,
  showSplitFraction,
  toggleSplit,
  type SplitOrientation,
} from './split.ts'

const PANES_SELECTOR = '[data-part="panes"]'
const SPLIT_RESIZER_SELECTOR = '[data-part="split-resizer"]'
const SPLIT_BUTTONS: ReadonlyArray<readonly [string, SplitOrientation]> = [
  ['#split-beside', 'beside'],
  ['#split-below', 'below'],
]
const SPLIT_STEP = 0.05
const NO_SPLIT = 0
const WHOLE = 1

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

interface SplitControls {
  refresh: () => void
  release: () => void
}

export function bindSplitControls(root: ParentNode): SplitControls {
  refreshSplit(root)
  reflectSplitButtons(root)
  bindSplitButtons(root)
  const { offSplitChanged } = onSplitChanged(root, () => {
    refreshSplit(root)
    reflectSplitButtons(root)
  })
  bindSplitResizer(root)

  return {
    refresh: () => {
      refreshSplit(root)
    },
    release: offSplitChanged,
  }
}
