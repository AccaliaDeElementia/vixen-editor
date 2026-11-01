'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { rovingFocus } from '../../../src/client/platform/roving-focus.ts'
import { KEYS } from '../../../src/client/platform/help.ts'
import { given } from '../../conditions.ts'

const REACHABLE = 0
const PASSED_OVER = -1

let bar: HTMLElement = document.createElement('div')

function toolbarOf(...names: readonly string[]): HTMLElement {
  const built = document.createElement('div')
  built.setAttribute('role', 'toolbar')

  for (const name of names) {
    const control = document.createElement('button')
    control.type = 'button'
    control.dataset.part = name
    built.append(control)
  }

  document.body.append(built)

  return built
}

function controlNamed(part: string): HTMLButtonElement | null {
  return bar.querySelector<HTMLButtonElement>(`[data-part="${part}"]`)
}

function press(key: string): void {
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }))
}

function focusedPart(): string | undefined {
  return document.activeElement instanceof HTMLElement ? document.activeElement.dataset.part : undefined
}

function stops(): Array<string | undefined> {
  return [...bar.querySelectorAll<HTMLElement>('button')]
    .filter((control) => control.tabIndex === REACHABLE)
    .map((control) => control.dataset.part)
}

beforeEach(() => {
  document.body.innerHTML = ''
  bar = toolbarOf('first', 'middle', 'last')
})

describe('a toolbar that has been given roving focus', () => {
  it('keeps one tab stop, so tabbing past it does not walk every control', () => {
    rovingFocus(bar)

    expect(stops()).toStrictEqual(['first'])
  })

  it('takes no focus when it is wired, because wiring happens while the reader is elsewhere', () => {
    const elsewhere = document.createElement('button')
    document.body.append(elsewhere)
    elsewhere.focus()

    rovingFocus(bar)

    expect(document.activeElement).toBe(elsewhere)
  })

  it('moves the focus to the next control on the right arrow', () => {
    rovingFocus(bar)
    controlNamed('first')?.focus()

    press(KEYS.nextControl)

    expect(focusedPart()).toBe('middle')
  })

  it('moves the focus to the previous control on the left arrow', () => {
    rovingFocus(bar)
    controlNamed('middle')?.focus()

    press(KEYS.previousControl)

    expect(focusedPart()).toBe('first')
  })

  it('carries the tab stop with the focus, so leaving and returning lands where the reader was', () => {
    rovingFocus(bar)
    controlNamed('first')?.focus()

    press(KEYS.nextControl)

    expect(stops()).toStrictEqual(['middle'])
  })

  it('wraps past the last control, because a toolbar is a ring rather than a line', () => {
    rovingFocus(bar)
    controlNamed('last')?.focus()

    press(KEYS.nextControl)

    expect(focusedPart()).toBe('first')
  })

  it('wraps back past the first control for the same reason', () => {
    rovingFocus(bar)
    controlNamed('first')?.focus()

    press(KEYS.previousControl)

    expect(focusedPart()).toBe('last')
  })

  it('jumps to the first control on Home', () => {
    rovingFocus(bar)
    controlNamed('last')?.focus()

    press(KEYS.firstControl)

    expect(focusedPart()).toBe('first')
  })

  it('jumps to the last control on End', () => {
    rovingFocus(bar)
    controlNamed('first')?.focus()

    press(KEYS.lastControl)

    expect(focusedPart()).toBe('last')
  })

  it('takes the arrow, so the page does not scroll under the reader', () => {
    rovingFocus(bar)
    controlNamed('first')?.focus()
    const arrow = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: KEYS.nextControl })

    document.activeElement?.dispatchEvent(arrow)

    expect(arrow.defaultPrevented).toBe(true)
  })

  it('leaves a key it does not answer for alone, so Enter still presses the control', () => {
    rovingFocus(bar)
    controlNamed('first')?.focus()
    const enter = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: KEYS.openRow })

    document.activeElement?.dispatchEvent(enter)

    expect(enter.defaultPrevented).toBe(false)
  })

  it('steps over a disabled control, which the reader cannot press anyway', () => {
    const middle = controlNamed('middle')
    if (middle !== null) middle.disabled = true
    rovingFocus(bar)
    controlNamed('first')?.focus()

    press(KEYS.nextControl)

    expect(focusedPart()).toBe('last')
  })

  it('moves nothing once every control has gone, because a strip can be redrawn out from under a key', () => {
    rovingFocus(bar)
    controlNamed('first')?.focus()
    bar.replaceChildren()

    bar.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: KEYS.nextControl }))

    expect(focusedPart()).toBeUndefined()
  })

  it('leaves the key alone when nothing can move, so a dead strip does not swallow it', () => {
    rovingFocus(bar)
    bar.replaceChildren()
    const arrow = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: KEYS.nextControl })

    bar.dispatchEvent(arrow)

    expect(arrow.defaultPrevented).toBe(false)
  })

  it('leaves the stop alone when the focus lands on something that is not a control', () => {
    rovingFocus(bar)

    bar.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    expect(stops()).toStrictEqual(['first'])
  })

  it('waits for its controls when it is wired before them, the way a tab strip is', () => {
    const empty = document.createElement('div')
    document.body.append(empty)
    rovingFocus(empty)
    const arrived = document.createElement('button')
    arrived.type = 'button'
    empty.append(arrived)
    arrived.focus()

    arrived.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: KEYS.lastControl }))

    expect(arrived.tabIndex).toBe(REACHABLE)
  })

  it('passes over a disabled control as well, so enabling it later does not add a second stop', () => {
    const middle = controlNamed('middle')
    if (middle !== null) middle.disabled = true
    rovingFocus(bar)

    if (middle !== null) middle.disabled = false

    expect(stops()).toStrictEqual(['first'])
  })

  it('follows a control the reader clicked, so the stop is where they last were', () => {
    rovingFocus(bar)

    controlNamed('last')?.focus()

    expect(stops()).toStrictEqual(['last'])
  })

  it('answers for controls added after it was wired, because a tab strip is redrawn', () => {
    rovingFocus(bar)
    const arrived = document.createElement('button')
    arrived.type = 'button'
    arrived.dataset.part = 'arrived'
    arrived.tabIndex = PASSED_OVER
    bar.append(arrived)
    given(() => {
      expect(stops()).toStrictEqual(['first'])
    })
    controlNamed('last')?.focus()

    press(KEYS.nextControl)

    expect(focusedPart()).toBe('arrived')
  })
})
