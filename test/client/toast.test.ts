'use sanity'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createToast, TOAST_VISIBLE_MS } from '../../src/client/layout/toast.ts'

let root: HTMLElement

function page({ withStatus = true } = {}): HTMLElement {
  const container = document.createElement('div')
  if (withStatus) {
    const status = document.createElement('output')
    status.id = 'status'
    status.dataset.visible = 'false'
    container.append(status)
  }
  document.body.append(container)
  return container
}

function statusElement(from: ParentNode): HTMLElement | null {
  return from.querySelector<HTMLElement>('#status')
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ''
  root = page()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('createToast', () => {
  it('writes the message into the status element', () => {
    createToast(root).show('Saved notes.md')

    expect(statusElement(root)?.textContent).toBe('Saved notes.md')
  })

  it('marks the toast visible', () => {
    createToast(root).show('Saved notes.md')

    expect(statusElement(root)?.dataset.visible).toBe('true')
  })

  it('hides the toast once the dwell time elapses', () => {
    createToast(root).show('Saved notes.md')

    vi.advanceTimersByTime(TOAST_VISIBLE_MS)

    expect(statusElement(root)?.dataset.visible).toBe('false')
  })

  it('stays visible right up to the dwell time', () => {
    createToast(root).show('Saved notes.md')

    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1)

    expect(statusElement(root)?.dataset.visible).toBe('true')
  })

  it('restarts the timer when a second message arrives', () => {
    const toast = createToast(root)
    toast.show('first')

    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1)
    toast.show('second')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1)

    expect(statusElement(root)?.textContent).toBe('second')
    expect(statusElement(root)?.dataset.visible).toBe('true')
  })

  it('does not throw when there is no status element', () => {
    document.body.innerHTML = ''
    const bare = page({ withStatus: false })

    expect(() => {
      createToast(bare).show('nowhere to go')
    }).not.toThrow()
  })

  it('defaults to the live document when given no root', () => {
    document.body.innerHTML = '<output id="status" data-visible="false"></output>'

    createToast().show('from the document')

    expect(statusElement(document)?.textContent).toBe('from the document')
  })
})
