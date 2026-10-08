'use sanity'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPreviews, TestOnly } from '../../../src/client/editor/previews.ts'

import { given } from '../../conditions.ts'
import { renderPane } from '../templates.ts'

const { PREVIEW_SETTLES_MS } = TestOnly

const MARKUP = { path: 'notes.md', view: 'markup' } as const
const SOURCE = { path: 'notes.md', view: 'source' } as const

let host: HTMLElement = document.createElement('div')
let stop: () => void = () => undefined

function page(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderPane()
  document.body.append(container)

  return container
}

function shown(part: string): string {
  return host.querySelector<HTMLElement>(`[data-part="${part}"]`)?.textContent ?? ''
}

function sectionFor(part: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-part="${part}"]`)
}

function previewing(): ReturnType<typeof createPreviews> {
  const previews = createPreviews(() => undefined)
  const { stop: release } = previews
  stop = release

  return previews
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ''
  host = page()
  stop = () => undefined
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

describe('a preview following the document it is of', () => {
  it('leaves it alone until the typing settles', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# before')

    previews.refreshWith(MARKUP.path, '# after')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS - 1)

    expect(shown('markup-body')).toBe('before')
  })

  it('renders it again once the typing has settled', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# before')

    previews.refreshWith(MARKUP.path, '# after')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('markup-body')).toBe('after')
  })

  it('starts the wait again on the next keystroke rather than letting the first land', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# before')

    previews.refreshWith(MARKUP.path, '# one')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS - 1)
    previews.refreshWith(MARKUP.path, '# two')
    await vi.advanceTimersByTimeAsync(1)

    expect(shown('markup-body')).toBe('before')
  })

  it('renders what the burst ended on, once it settles', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# before')

    previews.refreshWith(MARKUP.path, '# one')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS - 1)
    previews.refreshWith(MARKUP.path, '# two')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('markup-body')).toBe('two')
  })

  it('follows a source preview too', async () => {
    const previews = previewing()
    previews.render(host, SOURCE, '# before')

    previews.refreshWith(MARKUP.path, '# after')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('source-body')).toBe('<h1>after</h1>')
  })

  it('does nothing while no preview is showing', async () => {
    const previews = previewing()

    previews.refreshWith(MARKUP.path, '# after')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('markup-body')).toBe('')
  })
})

describe('letting the preview go', () => {
  it('drops work it had not done yet, so a torn-down editor renders nothing', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# before')
    previews.refreshWith(MARKUP.path, '# after')

    previews.stop()
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('markup-body')).toBe('before')
  })
})

describe('a refresh carrying another document’s text', () => {
  it('is ignored, so a preview cannot show what it is not named for', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# ALPHA')

    previews.refreshWith('bravo.md', '# BRAVO')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('markup-body')).toBe('ALPHA')
  })

  it('is ignored when the editor holds no document at all', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# ALPHA')

    previews.refreshWith(null, '# NOTHING')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('markup-body')).toBe('ALPHA')
  })
})

describe('writing a preview into a pane', () => {
  it('does not put it on screen, because the pane alone decides which view is showing', () => {
    const previews = previewing()

    previews.render(host, MARKUP, '# shown')

    expect(sectionFor('view-markup')?.hidden).toBe(true)
  })

  it('leaves a settled refresh unable to bring back a view the pane has moved off', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# before')
    given(() => {
      const section = sectionFor('view-markup')
      if (section !== null) section.hidden = true
    })

    previews.refreshWith(MARKUP.path, '# after')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(sectionFor('view-markup')?.hidden).toBe(true)
  })
})

describe('clicking a block in a preview', () => {
  it('names the document the preview is of, rather than leaving the caller to guess', () => {
    const asked: Array<[string, number]> = []
    const previews = createPreviews((entryPath: string, offset: number) => {
      asked.push([entryPath, offset])
    })
    const { stop: release } = previews
    stop = release
    previews.render(host, { path: 'elsewhere.md', view: 'markup' }, '# one\n\n# two')

    host.querySelectorAll<HTMLElement>('[data-part="markup-body"] h1')[1]?.click()

    expect(asked).toStrictEqual([['elsewhere.md', 7]])
  })
})

describe('following the caret into the preview', () => {
  function reachedBy(moved: string | null, offset: number, at = MARKUP): string[] {
    const previews = previewing()
    previews.render(host, at, '# one\n\n# two')

    const reached: string[] = []
    for (const block of host.querySelectorAll<HTMLElement>('[data-from]')) {
      block.scrollIntoView = () => {
        reached.push(block.dataset.from ?? '')
      }
    }

    previews.revealOffset(moved, offset)

    return reached
  }

  it('brings the block the caret sits in into view', () => {
    expect(reachedBy(MARKUP.path, 7)).toStrictEqual(['7'])
  })

  it('ignores a caret that moved in another document, which is not the one on show', () => {
    expect(reachedBy('bravo.md', 7)).toStrictEqual([])
  })

  it('ignores a caret moved in a pane that holds no document at all', () => {
    expect(reachedBy(null, 7)).toStrictEqual([])
  })
})
