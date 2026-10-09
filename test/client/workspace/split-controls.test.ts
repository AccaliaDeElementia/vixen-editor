'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { onSplitDismissRequested } from '../../../src/client/platform/split-changed.ts'
import { readSplit } from '../../../src/client/workspace/split.ts'

import { bindSplitControls } from '../../../src/client/workspace/split-controls.ts'

import { renderPage } from '../templates.ts'
import { given } from '../../conditions.ts'

const BOTH_PANES = 2

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

function pointer(type: string, clientX: number): PointerEvent {
  return new PointerEvent(type, { clientX, pointerId: 1, bubbles: true, cancelable: true })
}

beforeEach(() => {
  localStorage.clear()
  root = page()
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
    bindSplitControls(root)
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

  it('moves the divider where it was dragged', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(pointer('pointerdown', 0))
    splitResizer().dispatchEvent(pointer('pointermove', PANES_WIDTH * 0.7))

    expect(share()).toBeCloseTo(0.7)
  })

  it('writes nothing while the divider is still moving, so a drag is one write and not many', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(pointer('pointerdown', 0))
    splitResizer().dispatchEvent(pointer('pointermove', PANES_WIDTH * 0.7))

    expect(readSplit().fraction).toBeCloseTo(0.5)
  })

  it('writes where the divider ended up once the reader lets go', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(pointer('pointerdown', 0))
    splitResizer().dispatchEvent(pointer('pointermove', PANES_WIDTH * 0.7))
    splitResizer().dispatchEvent(pointer('pointerup', PANES_WIDTH * 0.7))

    expect(readSplit().fraction).toBeCloseTo(0.7)
  })

  it('writes where the divider reached when the browser takes the pointer away', () => {
    started()
    button('beside').click()

    splitResizer().dispatchEvent(pointer('pointerdown', 0))
    splitResizer().dispatchEvent(pointer('pointermove', PANES_WIDTH * 0.7))
    splitResizer().dispatchEvent(pointer('pointercancel', PANES_WIDTH * 0.7))

    expect(readSplit().fraction).toBeCloseTo(0.7)
  })

  it('stops dividing on a cancel, so a later move with nothing held leaves it alone', () => {
    started()
    button('beside').click()
    given(() => {
      splitResizer().dispatchEvent(pointer('pointerdown', 0))
      splitResizer().dispatchEvent(pointer('pointermove', PANES_WIDTH * 0.7))
      splitResizer().dispatchEvent(pointer('pointercancel', PANES_WIDTH * 0.7))
    })

    splitResizer().dispatchEvent(pointer('pointermove', PANES_WIDTH * 0.3))

    expect(panes().style.getPropertyValue('--split')).toBe('0.7')
  })

  it('binds nothing when the divider is missing but the panes are not, so one absent part is enough', () => {
    root.querySelector('[data-part="split-resizer"]')?.remove()

    expect(() => {
      bindSplitControls(root)
    }).not.toThrow()
  })

  it('paints nothing when the divider is dragged with no split to divide', () => {
    started()

    splitResizer().dispatchEvent(pointer('pointerdown', 0))
    splitResizer().dispatchEvent(pointer('pointermove', PANES_WIDTH * 0.7))

    expect(share()).toBeCloseTo(0.5)
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
    bindSplitControls(root)
    root.querySelector<HTMLElement>('#split-below')?.click()

    resizerFor().dispatchEvent(verticalPointer('pointerdown', 0))
    resizerFor().dispatchEvent(verticalPointer('pointermove', PANES_HEIGHT * 0.3))

    expect(Number.parseFloat(panes.style.getPropertyValue('--split'))).toBeCloseTo(0.3)
  })
})

describe('splitting a page that has no panes', () => {
  it('is left alone rather than failing', () => {
    root.querySelector('[data-part="panes"]')?.remove()
    bindSplitControls(root)

    root.querySelector<HTMLElement>('#split-beside')?.click()

    expect(root.querySelector('[data-part="panes"]')).toBeNull()
  })
})

describe('a divider dragged before anything has been laid out', () => {
  it('leaves the share alone rather than dividing by nothing', () => {
    bindSplitControls(root)
    root.querySelector<HTMLElement>('#split-beside')?.click()
    const panes = root.querySelector<HTMLElement>('[data-part="panes"]')

    root.querySelector<HTMLElement>('[data-part="split-resizer"]')?.dispatchEvent(pointer('pointerdown', 0))
    root.querySelector<HTMLElement>('[data-part="split-resizer"]')?.dispatchEvent(pointer('pointermove', 400))

    expect(Number.parseFloat(panes?.style.getPropertyValue('--split') ?? '')).toBeCloseTo(0.5)
  })
})

describe('a split control pressed while that split is the one on screen', () => {
  it('asks for the split to be dismissed rather than tearing it down itself', () => {
    const asked: string[] = []
    bindSplitControls(root)
    root.querySelector<HTMLElement>('#split-beside')?.click()
    onSplitDismissRequested(root, () => {
      asked.push('asked')
    })

    root.querySelector<HTMLElement>('#split-beside')?.click()

    expect(asked).toStrictEqual(['asked'])
  })

  it('leaves the second pane in place, because what becomes of its tabs is not the layout to decide', () => {
    bindSplitControls(root)
    root.querySelector<HTMLElement>('#split-beside')?.click()

    root.querySelector<HTMLElement>('#split-beside')?.click()

    expect(root.querySelectorAll('.pane')).toHaveLength(BOTH_PANES)
  })
})
