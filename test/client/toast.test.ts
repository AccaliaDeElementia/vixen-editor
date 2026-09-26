'use sanity'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createToast, TestOnly } from '../../src/client/layout/toast.ts'

const { FADE_MS, MAX_QUEUED, MAX_VISIBLE, OVERFLOW_TEXT, TOAST_ERROR_MS, TOAST_VISIBLE_MS } = TestOnly

const FIRST = 0

let root: HTMLElement = document.createElement('div')

function page({ withRegion = true } = {}): HTMLElement {
  const container = document.createElement('div')
  if (withRegion) {
    const region = document.createElement('div')
    region.id = 'status'
    container.append(region)
  }
  document.body.append(container)

  return container
}

function region(from: ParentNode = root): HTMLElement | null {
  return from.querySelector<HTMLElement>('#status')
}

function toasts(from: ParentNode = root): HTMLElement[] {
  return [...from.querySelectorAll<HTMLElement>('#status .toast')]
}

function texts(from: ParentNode = root): string[] {
  return toasts(from).map((element) => element.textContent)
}

function settle(): void {
  vi.advanceTimersByTime(FADE_MS)
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

describe('showing a toast', () => {
  it('writes the message into the region', () => {
    createToast(root).show('Saved notes.md')

    expect(texts()).toStrictEqual(['Saved notes.md'])
  })

  it('leaves the region empty until something is shown', () => {
    expect(region()?.children).toHaveLength(0)
  })

  it('marks an ordinary message as information', () => {
    createToast(root).show('Saved notes.md')

    expect(toasts()[0]?.dataset.severity).toBe('info')
  })

  it('marks a failure so it is distinguishable from a confirmation', () => {
    createToast(root).error('Upload refused')

    expect(toasts()[0]?.dataset.severity).toBe('error')
  })

  it('keeps a failure on screen for longer than a confirmation', () => {
    expect(TOAST_ERROR_MS).toBeGreaterThan(TOAST_VISIBLE_MS)
  })

  it('removes a message once its dwell and fade have elapsed', () => {
    createToast(root).show('Saved notes.md')

    vi.advanceTimersByTime(TOAST_VISIBLE_MS)
    settle()

    expect(texts()).toStrictEqual([])
  })

  it('empties the region once the last message goes, so css can hide it', () => {
    createToast(root).show('Saved notes.md')

    vi.advanceTimersByTime(TOAST_VISIBLE_MS)
    settle()

    expect(region()?.children).toHaveLength(0)
  })

  it('holds a failure past the time a confirmation would have gone', () => {
    createToast(root).error('Upload refused')

    vi.advanceTimersByTime(TOAST_VISIBLE_MS + FADE_MS)

    expect(texts()).toStrictEqual(['Upload refused'])
  })

  it('does not throw when the page has no region', () => {
    expect(() => {
      createToast(page({ withRegion: false })).show('nowhere to go')
    }).not.toThrow()
  })

  it('defaults to the live document when given no root', () => {
    document.body.innerHTML = '<div id="status"></div>'

    createToast().show('from the document')

    expect(texts(document)).toStrictEqual(['from the document'])
  })
})

describe('several toasts at once', () => {
  it('shows a second message beside the first rather than replacing it', () => {
    const toast = createToast(root)

    toast.show('Editing notes.md')
    toast.error('Upload refused')

    expect(texts()).toStrictEqual(['Editing notes.md', 'Upload refused'])
  })

  it('orders them most recently shown last, nearest the anchor', () => {
    const toast = createToast(root)

    toast.show('first')
    toast.show('second')
    toast.show('third')

    expect(texts()).toStrictEqual(['first', 'second', 'third'])
  })

  it('lets each expire on its own clock', () => {
    const toast = createToast(root)

    toast.error('Upload refused')
    toast.show('Saved notes.md')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)
    settle()

    expect(texts()).toStrictEqual(['Upload refused'])
  })

  it('does not let one component hide a message written by another', () => {
    const editor = createToast(root)
    const explorer = createToast(root)

    editor.show('Editing notes.md')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 100)
    explorer.error('Upload refused')
    vi.advanceTimersByTime(200)
    settle()

    expect(texts()).toStrictEqual(['Upload refused'])
  })
})

describe('identical messages coalesce', () => {
  it('shows one toast carrying a count rather than two toasts', () => {
    const toast = createToast(root)

    toast.error('a.png: too large')
    toast.error('a.png: too large')

    expect(texts()).toStrictEqual(['a.png: too large (2)'])
  })

  it('counts every repeat', () => {
    const toast = createToast(root)

    toast.error('boom')
    toast.error('boom')
    toast.error('boom')

    expect(texts()).toStrictEqual(['boom (3)'])
  })

  it('refreshes the dwell of a displayed toast, so a repeat is not cut short', () => {
    const toast = createToast(root)

    toast.show('Saving')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1)
    toast.show('Saving')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1)

    expect(texts()).toStrictEqual(['Saving (2)'])
  })

  it('keeps messages of different severity apart, despite identical words', () => {
    const toast = createToast(root)

    toast.show('busy')
    toast.error('busy')

    expect(texts()).toStrictEqual(['busy', 'busy'])
  })
})

describe('the handle a caller keeps', () => {
  it('replaces the message in place', () => {
    const handle = createToast(root).show('1 of 3 uploaded')

    handle.update('2 of 3 uploaded')

    expect(texts()).toStrictEqual(['2 of 3 uploaded'])
  })

  it('drops the coalesced count, because the text is no longer the same message', () => {
    const toast = createToast(root)
    toast.error('boom')
    const handle = toast.error('boom')

    handle.update('boom, finally')

    expect(texts()).toStrictEqual(['boom, finally'])
  })

  it('dismisses before the dwell elapses', () => {
    const handle = createToast(root).error('Reconnecting')

    handle.dismiss()

    expect(texts()).toStrictEqual([])
  })

  it('is inert when dismissed twice', () => {
    const handle = createToast(root).show('once')

    handle.dismiss()

    expect(() => {
      handle.dismiss()
    }).not.toThrow()
  })

  it('shows the message again when updated after being dismissed by hand', () => {
    const handle = createToast(root).show('working')

    handle.dismiss()
    handle.update('working again')

    expect(texts()).toStrictEqual(['working again'])
  })

  it('brings a fading toast back rather than updating it while it disappears', () => {
    const handle = createToast(root).show('working')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)

    handle.update('still working')

    expect(toasts()[FIRST]?.dataset.fading).toBeUndefined()
  })

  it('gives a revived toast its full dwell, not the remainder of a fade', () => {
    const handle = createToast(root).show('working')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)

    handle.update('still working')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1)

    expect(texts()).toStrictEqual(['still working'])
  })

  it('shows the message again when updated after it has gone', () => {
    const handle = createToast(root).show('still working')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)
    settle()

    handle.update('still working, slowly')

    expect(texts()).toStrictEqual(['still working, slowly'])
  })
})

describe('dismissing by click', () => {
  function click(element: HTMLElement | undefined): void {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('fades the toast out rather than snatching it away', () => {
    createToast(root).show('Saved notes.md')

    click(toasts()[FIRST])

    expect(toasts()[FIRST]?.dataset.fading).toBe('true')
  })

  it('removes it once the fade completes', () => {
    createToast(root).show('Saved notes.md')

    click(toasts()[FIRST])
    settle()

    expect(texts()).toStrictEqual([])
  })

  it('cuts the fade short when clicked again, rather than ignoring the second click', () => {
    createToast(root).show('Saved notes.md')

    click(toasts()[FIRST])
    click(toasts()[FIRST])

    expect(texts()).toStrictEqual([])
  })

  it('frees the slot, so a queued message takes its place', () => {
    const toast = createToast(root)
    for (let n = 0; n < MAX_VISIBLE + 1; n += 1) toast.show(`message ${String(n)}`)

    click(toasts()[FIRST])
    settle()

    expect(texts()).toContain(`message ${String(MAX_VISIBLE)}`)
  })
})

describe('dismissing through the handle', () => {
  it('drops a message that is still waiting its turn', () => {
    const toast = createToast(root)
    for (let n = 0; n < MAX_VISIBLE; n += 1) toast.show(`message ${String(n)}`)
    const waiting = toast.show('never seen')

    waiting.dismiss()
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)
    settle()

    expect(texts()).toStrictEqual([])
  })

  it('leaves a fading toast alone, so it is not removed twice', () => {
    const handle = createToast(root).show('Saved notes.md')
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)

    expect(() => {
      handle.dismiss()
    }).not.toThrow()

    settle()
    expect(texts()).toStrictEqual([])
  })
})

describe('a page with no region', () => {
  it('hands back a handle that does nothing rather than nothing at all', () => {
    const handle = createToast(page({ withRegion: false })).error('boom')

    expect(() => {
      handle.update('still boom')
      handle.dismiss()
    }).not.toThrow()
  })
})

describe('the stack is capped', () => {
  it(`shows at most ${String(MAX_VISIBLE)} ordinary messages`, () => {
    const toast = createToast(root)

    for (let n = 0; n < MAX_VISIBLE + 3; n += 1) toast.show(`message ${String(n)}`)

    expect(toasts()).toHaveLength(MAX_VISIBLE)
  })

  it('admits an error over the cap, so a failure is never hidden behind chatter', () => {
    const toast = createToast(root)

    for (let n = 0; n < MAX_VISIBLE; n += 1) toast.show(`message ${String(n)}`)
    toast.error('Upload refused')

    expect(texts().at(-1)).toBe('Upload refused')
    expect(toasts()).toHaveLength(MAX_VISIBLE + 1)
  })

  it('stops admitting errors once the stack is all errors', () => {
    const toast = createToast(root)

    for (let n = 0; n < MAX_VISIBLE; n += 1) toast.show(`message ${String(n)}`)
    for (let n = 0; n < MAX_VISIBLE + 2; n += 1) toast.error(`failure ${String(n)}`)

    expect(toasts()).toHaveLength(MAX_VISIBLE * 2)
  })

  it('promotes a queued message when a slot frees up', () => {
    const toast = createToast(root)

    for (let n = 0; n < MAX_VISIBLE + 1; n += 1) toast.show(`message ${String(n)}`)
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)
    settle()

    expect(texts()).toStrictEqual([`message ${String(MAX_VISIBLE)}`])
  })

  it("starts a promoted message's dwell at promotion, not at the moment it queued", () => {
    const toast = createToast(root)

    for (let n = 0; n < MAX_VISIBLE + 1; n += 1) toast.show(`message ${String(n)}`)
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)
    settle()
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1)

    expect(texts()).toStrictEqual([`message ${String(MAX_VISIBLE)}`])
  })

  it('promotes a queued error ahead of queued chatter', () => {
    const toast = createToast(root)

    for (let n = 0; n < MAX_VISIBLE; n += 1) toast.error(`failure ${String(n)}`)
    toast.show('queued chatter')
    toast.error('queued failure')
    vi.advanceTimersByTime(TOAST_ERROR_MS)
    settle()

    expect(texts().at(FIRST)).toBe('queued failure')
  })
})

describe('overflow past the queue', () => {
  function flood(extra: number): void {
    const toast = createToast(root)
    for (let n = 0; n < MAX_VISIBLE + MAX_QUEUED + extra; n += 1) toast.show(`message ${String(n)}`)
  }

  it('summarises rather than dropping silently', () => {
    flood(2)
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)
    settle()

    expect(texts().some((text) => text.startsWith(OVERFLOW_TEXT))).toBe(true)
  })

  it('counts everything it could not hold', () => {
    flood(3)
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)
    settle()

    expect(texts()).toContain(`${OVERFLOW_TEXT} (3)`)
  })

  it('shows the summary ahead of the messages still waiting, so the loss is known early', () => {
    flood(2)
    vi.advanceTimersByTime(TOAST_VISIBLE_MS)
    settle()

    expect(texts().at(FIRST)).toBe(`${OVERFLOW_TEXT} (2)`)
  })
})
