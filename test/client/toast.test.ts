'use sanity'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createToast, TestOnly } from '../../src/client/layout/toast.ts'

const { TOAST_ERROR_MS, TOAST_VISIBLE_MS } = TestOnly

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

describe('errors', () => {
  it('marks a failure so it is distinguishable from a confirmation', () => {
    createToast(root).error('Upload refused')

    expect(statusElement(root)?.dataset.severity).toBe('error')
  })

  it('marks an ordinary message as information', () => {
    createToast(root).show('Saved notes.md')

    expect(statusElement(root)?.dataset.severity).toBe('info')
  })

  it('keeps a failure on screen for longer than a confirmation', () => {
    expect(TOAST_ERROR_MS).toBeGreaterThan(TOAST_VISIBLE_MS)
  })

  it('hides a failure only after the longer delay', () => {
    createToast(root).error('Upload refused')

    vi.advanceTimersByTime(TOAST_VISIBLE_MS + 1)
    expect(statusElement(root)?.dataset.visible).toBe('true')

    vi.advanceTimersByTime(TOAST_ERROR_MS)
    expect(statusElement(root)?.dataset.visible).toBe('false')
  })

  it('does nothing when the page has no status element', () => {
    expect(() => {
      createToast(page({ withStatus: false })).error('boom')
    }).not.toThrow()
  })
})

describe('two handles to the same element', () => {
  it('does not let one handle hide a message written through another', () => {
    const editor = createToast(root)
    const explorer = createToast(root)

    editor.show('Editing notes.md')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 100)
    explorer.error('Upload refused')
    vi.advanceTimersByTime(200)

    expect(statusElement(root)?.dataset.visible).toBe('true')
    expect(statusElement(root)?.textContent).toBe('Upload refused')
  })

  it('lets a later message through either handle replace an earlier one', () => {
    const editor = createToast(root)
    const explorer = createToast(root)

    explorer.error('Upload refused')
    editor.show('Saved notes.md')

    expect(statusElement(root)?.textContent).toBe('Saved notes.md')
    expect(statusElement(root)?.dataset.severity).toBe('info')
  })
})
