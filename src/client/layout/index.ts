'use sanity'

import {
  applyExplorerState,
  applyExplorerWidth,
  clampExplorerWidth,
  EXPLORER_SELECTOR,
  MAX_EXPLORER_FRACTION,
  MIN_EXPLORER_PX,
  RESIZER_SELECTOR,
  setExplorerWidth,
  TOGGLE_SELECTOR,
  toggleExplorer,
} from './explorer.ts'

export const KEYBOARD_STEP_PX = 16

export interface LayoutOptions {
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

  let dragging = false

  resizer.addEventListener('pointerdown', (event: PointerEvent) => {
    dragging = true
    resizer.setPointerCapture(event.pointerId)
    event.preventDefault()
  })

  resizer.addEventListener('pointermove', (event: PointerEvent) => {
    if (!dragging) return
    applyExplorerWidth(root, widthFromPointer(explorer, event.clientX), view.innerWidth)
  })

  resizer.addEventListener('pointerup', (event: PointerEvent) => {
    if (!dragging) return
    dragging = false
    resizer.releasePointerCapture(event.pointerId)
    setExplorerWidth(widthFromPointer(explorer, event.clientX), view.innerWidth)
    applyExplorerState(root, view.innerWidth)
  })

  resizer.addEventListener('keydown', (event: KeyboardEvent) => {
    const current = explorer.getBoundingClientRect().width
    const maxPx = view.innerWidth * MAX_EXPLORER_FRACTION
    const next = keyboardWidth(event.key, current, maxPx)
    if (next === null) return

    event.preventDefault()
    setExplorerWidth(next, view.innerWidth)
    applyExplorerState(root, view.innerWidth)
  })
}

function keyboardWidth(key: string, currentPx: number, maxPx: number): number | null {
  if (key === 'ArrowLeft') return currentPx - KEYBOARD_STEP_PX
  if (key === 'ArrowRight') return currentPx + KEYBOARD_STEP_PX
  if (key === 'Home') return MIN_EXPLORER_PX
  if (key === 'End') return maxPx
  return null
}

function bindToggle(root: ParentNode, view: Window): void {
  const toggle = root.querySelector<HTMLElement>(TOGGLE_SELECTOR)
  if (toggle === null) return

  toggle.addEventListener('click', () => {
    toggleExplorer()
    applyExplorerState(root, view.innerWidth)
  })
}

function bindViewportResize(root: ParentNode, view: Window): void {
  view.addEventListener('resize', () => {
    applyExplorerState(root, view.innerWidth)
  })
}

export function initLayout(options: LayoutOptions = {}): void {
  const root = options.root ?? document
  const view = options.view ?? window

  applyExplorerState(root, view.innerWidth)
  bindResizer(root, view)
  bindToggle(root, view)
  bindViewportResize(root, view)
}

export { clampExplorerWidth }
