'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { given } from '../../conditions.ts'

import { bindHistoryButtons, refreshHistoryButtons } from '../../../src/client/chrome/history-buttons.ts'
import type { Navigator } from '../../../src/client/platform/navigation.ts'

import { renderPage } from '../templates.ts'
import { cast } from '../../cast.ts'

const BACK = '#nav-back'
const FORWARD = '#nav-forward'

let root: HTMLElement = document.createElement('div')
let back = vi.fn<() => void>()
let forward = vi.fn<() => void>()

function navigator(canGoBack: boolean, canGoForward: boolean): Navigator {
  return cast<Navigator>({ canGoBack: () => canGoBack, canGoForward: () => canGoForward, back, forward })
}

function button(selector: string): HTMLButtonElement {
  const element = root.querySelector<HTMLButtonElement>(selector)
  if (element === null) throw new Error(`missing ${selector}`)

  return element
}

beforeEach(() => {
  document.body.innerHTML = renderPage()
  ;({ body: root } = document)
  back = vi.fn()
  forward = vi.fn()
})

describe('showing where the reader can go', () => {
  it('enables back once there is somewhere behind to return to', () => {
    refreshHistoryButtons(root, navigator(true, false))

    expect(button(BACK).disabled).toBe(false)
  })

  it('leaves back disabled while there is nothing behind', () => {
    refreshHistoryButtons(root, navigator(false, false))

    expect(button(BACK).disabled).toBe(true)
  })

  it('says so to assistive technology as well as to the stylesheet', () => {
    refreshHistoryButtons(root, navigator(true, false))

    expect(button(BACK).getAttribute('aria-disabled')).toBe('false')
  })

  it('enables forward once back has been pressed and there is somewhere ahead', () => {
    refreshHistoryButtons(root, navigator(false, true))

    expect(button(FORWARD).disabled).toBe(false)
  })

  it('leaves forward disabled while there is nothing ahead', () => {
    refreshHistoryButtons(root, navigator(false, false))

    expect(button(FORWARD).disabled).toBe(true)
  })

  it('marks forward for assistive technology too', () => {
    refreshHistoryButtons(root, navigator(false, true))

    expect(button(FORWARD).getAttribute('aria-disabled')).toBe('false')
  })

  it('leaves a page without the buttons alone rather than failing', () => {
    document.body.innerHTML = ''

    expect(() => {
      refreshHistoryButtons(document.body, navigator(true, true))
    }).not.toThrow()
  })
})

describe('pressing one of them', () => {
  it('goes back', () => {
    const where = navigator(true, true)
    bindHistoryButtons(root, where)
    refreshHistoryButtons(root, where)
    given(() => {
      expect(button(BACK).disabled).toBe(false)
    })

    button(BACK).click()

    expect(back).toHaveBeenCalledTimes(1)
  })

  it('goes forward', () => {
    const where = navigator(true, true)
    bindHistoryButtons(root, where)
    refreshHistoryButtons(root, where)
    given(() => {
      expect(button(FORWARD).disabled).toBe(false)
    })

    button(FORWARD).click()

    expect(forward).toHaveBeenCalledTimes(1)
  })

  it('does not go forward when back was the one pressed', () => {
    const where = navigator(true, true)
    bindHistoryButtons(root, where)
    refreshHistoryButtons(root, where)
    given(() => {
      expect(button(BACK).disabled).toBe(false)
    })

    button(BACK).click()

    expect(forward).not.toHaveBeenCalled()
  })

  it('binds nothing on a page without the buttons rather than failing', () => {
    document.body.innerHTML = ''

    expect(() => {
      bindHistoryButtons(document.body, navigator(true, true))
    }).not.toThrow()
  })
})
