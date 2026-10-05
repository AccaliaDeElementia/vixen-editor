'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { cast } from '../../cast.ts'

import {
  MAX_EXPLORER_FRACTION,
  MIN_EXPLORER_PX,
  setExplorerWidth,
  TestOnly as explorerTestOnly,
} from '../../../src/client/layout/explorer.ts'
import { initLayout, TestOnly as indexTestOnly } from '../../../src/client/layout/index.ts'
import { requestInsert } from '../../../src/client/insert-entry.ts'

import { renderPage } from '../templates.ts'

const { KEYBOARD_STEP_PX } = indexTestOnly
const { readExplorerState } = explorerTestOnly

const VIEWPORT = 1000
const EXPLORER_LEFT = 64

let root: HTMLElement = document.createElement('div')

function page(): HTMLElement {
  document.body.innerHTML = renderPage()
  const explorer = document.body.querySelector('#explorer')
  // happy-dom does not lay out, so the geometry the drag maths reads is stubbed.
  Object.defineProperty(explorer, 'getBoundingClientRect', {
    value: () => ({ left: EXPLORER_LEFT, width: 320, top: 0, right: 0, bottom: 0, height: 0, x: 0, y: 0 }),
  })
  return document.body
}

function fakeView(innerWidth = VIEWPORT): Window {
  const listeners = new Map<string, EventListener>()
  return cast<Window>({
    innerWidth,
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.(event)
      return true
    },
  })
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

    const { teardownLayout } = initLayout()

    try {
      expect(widthPx()).toBe(400)
    } finally {
      teardownLayout()
    }
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

describe('the help button', () => {
  it('opens a dialog listing the gestures and shortcuts', () => {
    initLayout({ root, view: fakeView() })

    root.querySelector<HTMLElement>('#show-help')?.click()

    expect(root.querySelector('#file-dialog-title')?.textContent).toBe('Help')
  })

  it('lists the gestures and shortcuts in that dialog', () => {
    initLayout({ root, view: fakeView() })

    root.querySelector<HTMLElement>('#show-help')?.click()

    expect([...root.querySelectorAll('#file-dialog-body h3')].map((h) => h.textContent)).toContain('Keyboard')
  })

  it('offers a single way out', () => {
    initLayout({ root, view: fakeView() })

    root.querySelector<HTMLElement>('#show-help')?.click()

    expect(root.querySelector('#file-dialog-confirm')?.textContent).toBe('Close')
  })

  it('does nothing when the page has no help button', () => {
    document.body.innerHTML = '<div class="app" id="app"></div>'

    expect(() => {
      initLayout({ root: document.body, view: fakeView() })
    }).not.toThrow()
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

describe('inserting from a drawer that covers the document', () => {
  const NARROW = 400

  function opened(view: Window): void {
    initLayout({ root, view })
    if (app().dataset.explorer === 'closed') root.querySelector<HTMLElement>('#toggle-explorer')?.click()

    expect(app().dataset.explorer).toBe('open')
  }

  it('closes the drawer, because the document it went into is behind it', () => {
    opened(fakeView(NARROW))

    requestInsert(app(), 'notes.md')

    expect(app().dataset.explorer).toBe('closed')
  })

  it('leaves a wide explorer alone, where the document was never covered', () => {
    opened(fakeView(VIEWPORT))

    requestInsert(app(), 'notes.md')

    expect(app().dataset.explorer).toBe('open')
  })

  it('remembers the drawer as closed, so the next load agrees with the screen', () => {
    opened(fakeView(NARROW))

    requestInsert(app(), 'notes.md')

    expect(readExplorerState(NARROW).open).toBe(false)
  })
})

describe('splitting the workspace', () => {
  const PANES_WIDTH = 1200
  const PANES_HEIGHT = 800

  function panes(): HTMLElement {
    const element = root.querySelector<HTMLElement>('[data-part="panes"]')
    if (element === null) throw new Error('missing panes')
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: PANES_WIDTH,
        height: PANES_HEIGHT,
        right: PANES_WIDTH,
        bottom: PANES_HEIGHT,
        x: 0,
        y: 0,
      }),
    })

    return element
  }

  function started(): void {
    panes()
    initLayout({ root, view: fakeView() })
  }

  function button(which: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(`#split-${which}`)
    if (element === null) throw new Error(`missing #split-${which}`)
    return element
  }

  function splitResizer(): HTMLElement {
    const element = root.querySelector<HTMLElement>('[data-part="split-resizer"]')
    if (element === null) throw new Error('missing split resizer')
    return element
  }

  function share(): number {
    return Number.parseFloat(panes().style.getPropertyValue('--split'))
  }

  it('tells the stylesheet to lay the panes out side by side', () => {
    started()

    button('beside').click()

    expect(panes().dataset.split).toBe('beside')
  })

  it('marks the control it is currently using', () => {
    started()

    button('below').click()

    expect(button('below').getAttribute('aria-pressed')).toBe('true')
  })

  it('leaves the other control unmarked, since one orientation is in force at a time', () => {
    started()

    button('below').click()

    expect(button('beside').getAttribute('aria-pressed')).toBe('false')
  })

  it('returns to one pane when the control in force is pressed again', () => {
    started()
    button('beside').click()

    button('beside').click()

    expect(panes().dataset.split).toBeUndefined()
  })

  it('moves the divider where it was dragged', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(pointer('pointerdown', 0))
    splitResizer().dispatchEvent(pointer('pointermove', PANES_WIDTH * 0.7))

    expect(share()).toBeCloseTo(0.7)
  })

  it('ignores a drag that never started, so a stray move does not resize', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(pointer('pointermove', PANES_WIDTH * 0.7))

    expect(share()).toBeCloseTo(0.5)
  })

  it('ignores a release that no drag preceded', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(pointer('pointerup', PANES_WIDTH * 0.35))

    expect(share()).toBeCloseTo(0.5)
  })

  it('settles where the pointer was let go', () => {
    started()
    button('beside').click()
    splitResizer().dispatchEvent(pointer('pointerdown', 0))

    splitResizer().dispatchEvent(pointer('pointerup', PANES_WIDTH * 0.35))

    expect(share()).toBeCloseTo(0.35)
  })

  it('narrows a step at a time from the keyboard', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))

    expect(share()).toBeCloseTo(0.45)
  })

  it('widens a step at a time from the keyboard', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))

    expect(share()).toBeCloseTo(0.55)
  })

  it('goes to the narrowest the first pane may be', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))

    expect(share()).toBeCloseTo(280 / PANES_WIDTH)
  })

  it('goes to the widest the first pane may be', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))

    expect(share()).toBeCloseTo(1 - 280 / PANES_WIDTH)
  })

  it('leaves a key it does not handle to the browser', () => {
    started()
    button('beside').click()

    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    splitResizer().dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('re-applies the split when the window changes size, since the floor is in pixels', () => {
    started()
    button('beside').click()

    root.ownerDocument.defaultView?.dispatchEvent(new Event('resize'))

    expect(share()).toBeCloseTo(0.5)
  })
})

describe('splitting above and below', () => {
  const PANES_WIDTH = 1200
  const PANES_HEIGHT = 800

  function measuredPanes(): HTMLElement {
    const element = root.querySelector<HTMLElement>('[data-part="panes"]')
    if (element === null) throw new Error('missing panes')
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: PANES_WIDTH,
        height: PANES_HEIGHT,
        right: PANES_WIDTH,
        bottom: PANES_HEIGHT,
        x: 0,
        y: 0,
      }),
    })

    return element
  }

  function resizerFor(): HTMLElement {
    const element = root.querySelector<HTMLElement>('[data-part="split-resizer"]')
    if (element === null) throw new Error('missing split resizer')
    return element
  }

  function verticalPointer(type: string, clientY: number): PointerEvent {
    return new PointerEvent(type, { clientY, pointerId: 1, bubbles: true, cancelable: true })
  }

  it('measures the drag down the page rather than across it', () => {
    const panes = measuredPanes()
    initLayout({ root, view: fakeView() })
    root.querySelector<HTMLElement>('#split-below')?.click()

    resizerFor().dispatchEvent(verticalPointer('pointerdown', 0))
    resizerFor().dispatchEvent(verticalPointer('pointermove', PANES_HEIGHT * 0.3))

    expect(Number.parseFloat(panes.style.getPropertyValue('--split'))).toBeCloseTo(0.3)
  })
})

describe('splitting a page that has no panes', () => {
  it('is left alone rather than failing', () => {
    root.querySelector('[data-part="panes"]')?.remove()
    initLayout({ root, view: fakeView() })

    root.querySelector<HTMLElement>('#split-beside')?.click()

    expect(root.querySelector('[data-part="panes"]')).toBeNull()
  })
})

describe('a divider dragged before anything has been laid out', () => {
  it('leaves the share alone rather than dividing by nothing', () => {
    initLayout({ root, view: fakeView() })
    root.querySelector<HTMLElement>('#split-beside')?.click()
    const panes = root.querySelector<HTMLElement>('[data-part="panes"]')

    root.querySelector<HTMLElement>('[data-part="split-resizer"]')?.dispatchEvent(pointer('pointerdown', 0))
    root.querySelector<HTMLElement>('[data-part="split-resizer"]')?.dispatchEvent(pointer('pointermove', 400))

    expect(Number.parseFloat(panes?.style.getPropertyValue('--split') ?? '')).toBeCloseTo(0.5)
  })
})
