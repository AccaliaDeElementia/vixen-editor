'use sanity'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPreviews, TestOnly } from '../../../src/client/editor/previews.ts'

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

    previews.refreshWith('# after')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS - 1)

    expect(shown('markup-body')).toBe('before')
  })

  it('renders it again once the typing has settled', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# before')

    previews.refreshWith('# after')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('markup-body')).toBe('after')
  })

  it('starts the wait again on the next keystroke rather than letting the first land', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# before')

    previews.refreshWith('# one')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS - 1)
    previews.refreshWith('# two')
    await vi.advanceTimersByTimeAsync(1)

    expect(shown('markup-body')).toBe('before')
  })

  it('renders what the burst ended on, once it settles', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# before')

    previews.refreshWith('# one')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS - 1)
    previews.refreshWith('# two')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('markup-body')).toBe('two')
  })

  it('follows a source preview too', async () => {
    const previews = previewing()
    previews.render(host, SOURCE, '# before')

    previews.refreshWith('# after')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('source-body')).toBe('# after')
  })

  it('does nothing while no preview is showing', async () => {
    const previews = previewing()

    previews.refreshWith('# after')
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('markup-body')).toBe('')
  })
})

describe('letting the preview go', () => {
  it('drops work it had not done yet, so a torn-down editor renders nothing', async () => {
    const previews = previewing()
    previews.render(host, MARKUP, '# before')
    previews.refreshWith('# after')

    previews.stop()
    await vi.advanceTimersByTimeAsync(PREVIEW_SETTLES_MS)

    expect(shown('markup-body')).toBe('before')
  })
})
