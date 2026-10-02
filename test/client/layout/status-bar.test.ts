'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createStatusBar, TestOnly, type StatusBar } from '../../../src/client/layout/status-bar.ts'

import { renderSection } from '../templates.ts'

const { COUNTDOWN_ATTRIBUTE, COUNTDOWN_PROPERTY, COUNTDOWN_RUNS, SAVE_LABELS } = TestOnly

function page(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderSection('.statusbar')
  document.body.append(container)

  return container
}

function bar(root: ParentNode = page()): StatusBar {
  return createStatusBar(root)
}

function textOf(root: ParentNode, selector: string): string {
  return root.querySelector(selector)?.textContent.trim() ?? ''
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('the open path', () => {
  it('shows the path in full, not the shortened title', () => {
    const root = page()

    bar(root).showPath('journal/2026/a.md')

    expect(textOf(root, '#open-path')).toBe('journal/2026/a.md')
  })

  it('names the store root rather than showing nothing', () => {
    const root = page()

    bar(root).showPath('')

    expect(textOf(root, '#open-path')).toBe('All documents')
  })

  it('follows the document when it moves', () => {
    const root = page()
    const status = bar(root)

    status.showPath('notes.md')
    status.showPath('archive/notes.md')

    expect(textOf(root, '#open-path')).toBe('archive/notes.md')
  })
})

describe('the word count', () => {
  it.each([
    ['', '0 words'],
    ['one', '1 word'],
    ['one two three', '3 words'],
    ['   spaced   out   ', '2 words'],
    ['line\nbreaks\tcount', '3 words'],
  ])('counts %j as %s', (content, expected) => {
    const root = page()

    bar(root).showWordCount(content)

    expect(textOf(root, '#word-count')).toBe(expected)
  })

  it('says one word in the singular, because a count nobody reads is still read', () => {
    const root = page()

    bar(root).showWordCount('solo')

    expect(textOf(root, '#word-count')).toBe('1 word')
  })
})

describe('what the save state says', () => {
  it.each([
    ['pending', SAVE_LABELS.pending],
    ['saving', SAVE_LABELS.saving],
    ['empty', SAVE_LABELS.empty],
    ['failed', SAVE_LABELS.failed],
  ] as const)('reads %s as %j', (state, expected) => {
    const root = page()

    bar(root).showSaveState(state, null)

    expect(textOf(root, '#save-label')).toBe(expected)
  })

  it('says nothing before anything has been written, rather than claiming a save', () => {
    const root = page()

    bar(root).showSaveState('clean', null)

    expect(textOf(root, '#save-label')).toBe('')
  })

  it('says saved once a write has actually landed', () => {
    const root = page()
    const status = bar(root)

    status.showSaveState('saving', null)
    status.showSaveState('clean', null)

    expect(textOf(root, '#save-label')).toBe('Saved')
  })

  it('keeps saying saved on later clean reports', () => {
    const root = page()
    const status = bar(root)

    status.showSaveState('saving', null)
    status.showSaveState('clean', null)
    status.showSaveState('pending', Date.now() + 1000)
    status.showSaveState('clean', null)

    expect(textOf(root, '#save-label')).toBe('Saved')
  })
})

describe('the countdown to the next save', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('runs only while a save is pending', () => {
    const root = page()

    bar(root).showSaveState('pending', Date.now() + 30_000)

    expect(root.querySelector('#save-countdown')?.hasAttribute(COUNTDOWN_ATTRIBUTE)).toBe(true)
  })

  it('carries the time remaining, so the bar means time until the next save', () => {
    const root = page()

    bar(root).showSaveState('pending', Date.now() + 30_000)

    const countdown = root.querySelector<HTMLElement>('#save-countdown')

    expect(countdown?.style.getPropertyValue(COUNTDOWN_PROPERTY)).toBe('30000ms')
  })

  it('shortens as the ceiling closes in, because dueAt is whichever fires first', () => {
    const root = page()

    bar(root).showSaveState('pending', Date.now() + 4000)

    const countdown = root.querySelector<HTMLElement>('#save-countdown')

    expect(countdown?.style.getPropertyValue(COUNTDOWN_PROPERTY)).toBe('4000ms')
  })

  it.each(['clean', 'saving', 'empty', 'failed'] as const)(
    'stops for %s even when a deadline is still on offer, because nothing is pending',
    (state) => {
      const root = page()
      const status = bar(root)

      status.showSaveState('pending', Date.now() + 30_000)
      status.showSaveState(state, Date.now() + 30_000)

      expect(root.querySelector('#save-countdown')?.hasAttribute(COUNTDOWN_ATTRIBUTE)).toBe(false)
    },
  )

  it('stops when a pending save has no deadline to count to', () => {
    const root = page()

    bar(root).showSaveState('pending', null)

    expect(root.querySelector('#save-countdown')?.hasAttribute(COUNTDOWN_ATTRIBUTE)).toBe(false)
  })

  it('never asks for a negative duration, however late the deadline is read', () => {
    const root = page()

    bar(root).showSaveState('pending', Date.now() - 5000)

    const countdown = root.querySelector<HTMLElement>('#save-countdown')

    expect(countdown?.style.getPropertyValue(COUNTDOWN_PROPERTY)).toBe('0ms')
  })

  it('names a different run when the countdown restarts, because that is what restarts the animation', () => {
    const root = page()
    const status = bar(root)
    const countdown = root.querySelector<HTMLElement>('#save-countdown')

    status.showSaveState('pending', Date.now() + 30_000)
    const first = countdown?.getAttribute(COUNTDOWN_ATTRIBUTE)
    status.showSaveState('pending', Date.now() + 30_000)

    expect(countdown?.getAttribute(COUNTDOWN_ATTRIBUTE)).not.toBe(first)
  })

  it('alternates between the two runs the stylesheet knows about', () => {
    const root = page()
    const status = bar(root)
    const countdown = root.querySelector<HTMLElement>('#save-countdown')
    const seen: Array<string | null> = []

    for (const dueIn of [30_000, 30_000, 30_000]) {
      status.showSaveState('pending', Date.now() + dueIn)
      seen.push(countdown?.getAttribute(COUNTDOWN_ATTRIBUTE) ?? null)
    }

    expect(seen).toStrictEqual([COUNTDOWN_RUNS.second, COUNTDOWN_RUNS.first, COUNTDOWN_RUNS.second])
  })
})

describe('markup that does not match', () => {
  it('declines rather than throwing, the way the dialog does', () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    expect(() => {
      const status = createStatusBar(bare)
      status.showPath('notes.md')
      status.showWordCount('one two')
      status.showSaveState('pending', Date.now() + 1000)
    }).not.toThrow()
  })
})

describe('showing a different path', () => {
  it('forgets that anything was saved, because it was saved to the previous document', () => {
    const root = page()
    const status = bar(root)

    status.showSaveState('saving', null)
    status.showSaveState('clean', null)
    status.showPath('other.md')

    expect(textOf(root, '#save-label')).toBe('')
  })

  it('says saved again once the new document has been written', () => {
    const root = page()
    const status = bar(root)

    status.showPath('other.md')
    status.showSaveState('saving', null)
    status.showSaveState('clean', null)

    expect(textOf(root, '#save-label')).toBe('Saved')
  })
})

describe('a save that was attempted but refused', () => {
  it('does not claim the document is saved once the buffer goes clean again', () => {
    const root = page()
    const status = bar(root)

    status.showSaveState('pending', Date.now() + 1000)
    status.showSaveState('saving', null)
    status.showSaveState('failed', null)
    status.showSaveState('clean', null)

    expect(textOf(root, '#save-label')).toBe('')
  })
})
