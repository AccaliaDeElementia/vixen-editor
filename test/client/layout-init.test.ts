'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  MAX_EXPLORER_FRACTION,
  MIN_EXPLORER_PX,
  setExplorerWidth,
  TestOnly as explorerTestOnly,
} from '../../src/client/layout/explorer.ts'
import { initLayout, TestOnly as indexTestOnly } from '../../src/client/layout/index.ts'

const { KEYBOARD_STEP_PX } = indexTestOnly
const { readExplorerState } = explorerTestOnly

const VIEWPORT = 1000
const EXPLORER_LEFT = 64

let root: HTMLElement

function page(): HTMLElement {
  document.body.innerHTML = `
    <div class="app" id="app" data-explorer="open">
      <button id="toggle-explorer" aria-expanded="true" aria-pressed="true"></button>
      <aside id="explorer">
        <button id="explorer-resizer" role="separator"></button>
      </aside>
    </div>`
  const explorer = document.body.querySelector('#explorer')
  // happy-dom does not lay out, so the geometry the drag maths reads is stubbed.
  Object.defineProperty(explorer, 'getBoundingClientRect', {
    value: () => ({ left: EXPLORER_LEFT, width: 320, top: 0, right: 0, bottom: 0, height: 0, x: 0, y: 0 }),
  })
  return document.body
}

function fakeView(innerWidth = VIEWPORT): Window {
  const listeners = new Map<string, EventListener>()
  return {
    innerWidth,
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.(event)
      return true
    },
  } as unknown as Window
}

function app(): HTMLElement {
  const element = root.querySelector<HTMLElement>('#app')
  if (element === null) throw new Error('missing #app')
  return element
}

function resizer(): HTMLElement {
  const element = root.querySelector<HTMLElement>('#explorer-resizer')
  if (element === null) throw new Error('missing resizer')
  return element
}

function pointer(type: string, clientX: number): PointerEvent {
  return new PointerEvent(type, { clientX, pointerId: 1, bubbles: true, cancelable: true })
}

function widthPx(): number {
  return Number.parseFloat(app().style.getPropertyValue('--explorer-width'))
}

beforeEach(() => {
  localStorage.clear()
  root = page()
})

describe('initLayout', () => {
  it('applies the stored state on start', () => {
    setExplorerWidth(400, VIEWPORT)

    initLayout({ root, view: fakeView() })

    expect(widthPx()).toBe(400)
  })

  it('tolerates a page without the layout shell', () => {
    document.body.innerHTML = '<p>nothing here</p>'

    expect(() => {
      initLayout({ root: document.body, view: fakeView() })
    }).not.toThrow()
  })

  it('falls back to the live document and window when given no options', () => {
    setExplorerWidth(400, window.innerWidth)

    initLayout()

    expect(widthPx()).toBe(400)
  })
})

describe('dragging the resizer', () => {
  it('resizes live while dragging', () => {
    initLayout({ root, view: fakeView() })

    resizer().dispatchEvent(pointer('pointerdown', EXPLORER_LEFT + 300))
    resizer().dispatchEvent(pointer('pointermove', EXPLORER_LEFT + 450))

    expect(widthPx()).toBe(450)
  })

  it('does not persist mid-drag, so one drag writes storage once', () => {
    initLayout({ root, view: fakeView() })

    resizer().dispatchEvent(pointer('pointerdown', EXPLORER_LEFT + 300))
    resizer().dispatchEvent(pointer('pointermove', EXPLORER_LEFT + 450))

    expect(readExplorerState(VIEWPORT).widthPx).toBeNull()
  })

  it('persists on release', () => {
    initLayout({ root, view: fakeView() })

    resizer().dispatchEvent(pointer('pointerdown', EXPLORER_LEFT + 300))
    resizer().dispatchEvent(pointer('pointermove', EXPLORER_LEFT + 450))
    resizer().dispatchEvent(pointer('pointerup', EXPLORER_LEFT + 450))

    expect(readExplorerState(VIEWPORT).widthPx).toBe(450)
  })

  it('ignores movement when no drag is in progress', () => {
    initLayout({ root, view: fakeView() })

    resizer().dispatchEvent(pointer('pointermove', EXPLORER_LEFT + 450))

    expect(app().style.getPropertyValue('--explorer-width')).toBe('')
  })

  it('ignores a release when no drag is in progress', () => {
    initLayout({ root, view: fakeView() })

    resizer().dispatchEvent(pointer('pointerup', EXPLORER_LEFT + 450))

    expect(readExplorerState(VIEWPORT).widthPx).toBeNull()
  })

  it('caps a drag past the maximum fraction of the viewport', () => {
    initLayout({ root, view: fakeView() })

    resizer().dispatchEvent(pointer('pointerdown', EXPLORER_LEFT + 300))
    resizer().dispatchEvent(pointer('pointermove', EXPLORER_LEFT + 5000))

    expect(widthPx()).toBe(VIEWPORT * MAX_EXPLORER_FRACTION)
  })

  it('floors a drag below the minimum', () => {
    initLayout({ root, view: fakeView() })

    resizer().dispatchEvent(pointer('pointerdown', EXPLORER_LEFT + 300))
    resizer().dispatchEvent(pointer('pointermove', EXPLORER_LEFT))

    expect(widthPx()).toBe(MIN_EXPLORER_PX)
  })
})

describe('keyboard resizing', () => {
  function press(key: string): void {
    resizer().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  }

  it('narrows with the left arrow', () => {
    initLayout({ root, view: fakeView() })

    press('ArrowLeft')

    expect(readExplorerState(VIEWPORT).widthPx).toBe(320 - KEYBOARD_STEP_PX)
  })

  it('widens with the right arrow', () => {
    initLayout({ root, view: fakeView() })

    press('ArrowRight')

    expect(readExplorerState(VIEWPORT).widthPx).toBe(320 + KEYBOARD_STEP_PX)
  })

  it('jumps to the minimum with Home', () => {
    initLayout({ root, view: fakeView() })

    press('Home')

    expect(readExplorerState(VIEWPORT).widthPx).toBe(MIN_EXPLORER_PX)
  })

  it('jumps to the maximum with End', () => {
    initLayout({ root, view: fakeView() })

    press('End')

    expect(readExplorerState(VIEWPORT).widthPx).toBe(VIEWPORT * MAX_EXPLORER_FRACTION)
  })

  it('ignores keys that are not resize controls', () => {
    initLayout({ root, view: fakeView() })

    press('a')

    expect(readExplorerState(VIEWPORT).widthPx).toBeNull()
  })
})

describe('the toggle button', () => {
  function clickToggle(): void {
    root.querySelector<HTMLElement>('#toggle-explorer')?.click()
  }

  it('closes the explorer', () => {
    initLayout({ root, view: fakeView() })

    clickToggle()

    expect(app().dataset.explorer).toBe('closed')
  })

  it('reopens the explorer', () => {
    initLayout({ root, view: fakeView() })

    clickToggle()
    clickToggle()

    expect(app().dataset.explorer).toBe('open')
  })

  it('restores the custom width when reopened', () => {
    setExplorerWidth(420, VIEWPORT)
    initLayout({ root, view: fakeView() })

    clickToggle()
    clickToggle()

    expect(widthPx()).toBe(420)
  })
})

describe('viewport resize', () => {
  it('re-clamps a stored width that no longer fits', () => {
    setExplorerWidth(700, VIEWPORT)
    const view = fakeView(1000)
    initLayout({ root, view })

    Object.defineProperty(view, 'innerWidth', { value: 400, configurable: true })
    view.dispatchEvent(new Event('resize'))

    expect(widthPx()).toBe(400 * MAX_EXPLORER_FRACTION)
  })
})
