'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { bindDragging } from '../../../src/client/platform/dragging.ts'

const POINTER = 1
const STARTED_AT = 0
const MOVED_TO = 120
const LET_GO_AT = 200

let resizer: HTMLElement = document.createElement('div')
let show = vi.fn<(event: PointerEvent) => void>()
let settle = vi.fn<(event: PointerEvent) => void>()
let captured: number[] = []
let released: number[] = []

function pointer(type: string, clientX: number): PointerEvent {
  return new PointerEvent(type, { clientX, pointerId: POINTER, bubbles: true, cancelable: true })
}

function send(type: string, clientX: number): PointerEvent {
  const event = pointer(type, clientX)
  resizer.dispatchEvent(event)

  return event
}

beforeEach(() => {
  document.body.innerHTML = ''
  resizer = document.createElement('div')
  document.body.append(resizer)
  captured = []
  released = []
  resizer.setPointerCapture = (id: number): void => {
    captured.push(id)
  }
  resizer.releasePointerCapture = (id: number): void => {
    released.push(id)
  }
  show = vi.fn()
  settle = vi.fn()
  bindDragging(resizer, { show, settle })
})

describe('a drag that has begun', () => {
  it('reports where the pointer moved to', () => {
    send('pointerdown', STARTED_AT)

    send('pointermove', MOVED_TO)

    expect(show).toHaveBeenCalledTimes(1)
  })

  it('takes the pointer, so a move that leaves the handle still arrives', () => {
    send('pointerdown', STARTED_AT)

    expect(captured).toStrictEqual([POINTER])
  })

  it('claims the gesture, or the browser begins selecting text instead', () => {
    expect(send('pointerdown', STARTED_AT).defaultPrevented).toBe(true)
  })

  it('settles where the pointer was let go', () => {
    send('pointerdown', STARTED_AT)

    send('pointerup', LET_GO_AT)

    expect(settle).toHaveBeenCalledTimes(1)
  })

  it('gives the pointer back once the reader lets go', () => {
    send('pointerdown', STARTED_AT)

    send('pointerup', LET_GO_AT)

    expect(released).toStrictEqual([POINTER])
  })

  it('settles where it had reached when the browser takes the pointer away', () => {
    send('pointerdown', STARTED_AT)

    send('pointercancel', LET_GO_AT)

    expect(settle).toHaveBeenCalledTimes(1)
  })

  it('does not hand a cancelled pointer back, because the browser already took it', () => {
    send('pointerdown', STARTED_AT)

    send('pointercancel', LET_GO_AT)

    expect(released).toStrictEqual([])
  })
})

describe('a drag that never began', () => {
  it('ignores a stray move', () => {
    send('pointermove', MOVED_TO)

    expect(show).not.toHaveBeenCalled()
  })

  it('ignores a release nothing preceded', () => {
    send('pointerup', LET_GO_AT)

    expect(settle).not.toHaveBeenCalled()
  })

  it('ignores a cancel nothing preceded', () => {
    send('pointercancel', LET_GO_AT)

    expect(settle).not.toHaveBeenCalled()
  })
})

describe('a drag that has already finished', () => {
  it('ignores a later move, so the handle does not follow the pointer around', () => {
    send('pointerdown', STARTED_AT)
    send('pointerup', LET_GO_AT)

    send('pointermove', MOVED_TO)

    expect(show).not.toHaveBeenCalled()
  })

  it('ignores a second release', () => {
    send('pointerdown', STARTED_AT)
    send('pointerup', LET_GO_AT)

    send('pointerup', LET_GO_AT)

    expect(settle).toHaveBeenCalledTimes(1)
  })
})

describe('a drag the browser took away', () => {
  it('settles it, so the handle does not stay held', () => {
    send('pointerdown', STARTED_AT)

    send('pointercancel', MOVED_TO)

    expect(settle).toHaveBeenCalledTimes(1)
  })

  it('stops following the pointer afterwards, because the drag is over', () => {
    send('pointerdown', STARTED_AT)
    send('pointercancel', MOVED_TO)

    send('pointermove', LET_GO_AT)

    expect(show).toHaveBeenCalledTimes(0)
  })
})
