'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { applySplit, readSplit, setSplitFraction, toggleSplit, TestOnly } from '../../../src/client/layout/split.ts'

const { EVEN_SPLIT, MIN_PANE_WIDTH_PX, MIN_PANE_HEIGHT_PX } = TestOnly

const WIDE = 1600
const TALL = 900
const NARROWER_THAN_TWO_PANES = MIN_PANE_WIDTH_PX + MIN_PANE_WIDTH_PX - 1

function page(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML =
    '<div class="panes" data-part="panes"><section class="pane"></section>' +
    '<div data-part="split-resizer"></div>' +
    '<template data-part="second-pane"><section class="pane"></section></template></div>'
  document.body.append(container)

  return container
}

function paneCount(root: ParentNode): number {
  return root.querySelectorAll('.pane').length
}

function panes(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-part="panes"]')
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('a workspace that has never been split', () => {
  it('holds one pane', () => {
    expect(readSplit().orientation).toBeNull()
  })

  it('starts at an even share, so the first split is half and half', () => {
    expect(readSplit().fraction).toBe(EVEN_SPLIT)
  })

  it('leaves the panes with no split for the stylesheet to lay out', () => {
    const root = page()

    applySplit(root, WIDE)

    expect(panes(root)?.dataset.split).toBeUndefined()
  })
})

describe('splitting', () => {
  it('tells the stylesheet there are two panes now', () => {
    const root = page()

    toggleSplit(root, 'beside', WIDE)

    expect(panes(root)?.dataset.split).toBe('beside')
  })

  it('builds the second pane, which did not exist until now', () => {
    const root = page()

    toggleSplit(root, 'beside', WIDE)

    expect(paneCount(root)).toBe(2)
  })

  it('builds it only once, however often the layout is re-applied', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)

    applySplit(root, WIDE)

    expect(paneCount(root)).toBe(2)
  })

  it('records which way it was split', () => {
    const root = page()

    toggleSplit(root, 'below', TALL)

    expect(readSplit().orientation).toBe('below')
  })

  it('tells the layout which way to run', () => {
    const root = page()

    toggleSplit(root, 'below', TALL)

    expect(panes(root)?.dataset.split).toBe('below')
  })

  it('starts half and half', () => {
    const root = page()

    toggleSplit(root, 'beside', WIDE)

    expect(panes(root)?.style.getPropertyValue('--split')).toBe(String(EVEN_SPLIT))
  })

  it('says which way the divider runs, so it is announced correctly', () => {
    const root = page()

    toggleSplit(root, 'below', TALL)

    expect(root.querySelector('[data-part="split-resizer"]')?.getAttribute('aria-orientation')).toBe('horizontal')
  })
})

describe('asking for the split it already has', () => {
  it('returns to a single pane', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)

    toggleSplit(root, 'beside', WIDE)

    expect(readSplit().orientation).toBeNull()
  })

  it('takes the second pane away again, so an unsplit workspace holds one', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)

    toggleSplit(root, 'beside', WIDE)

    expect(paneCount(root)).toBe(1)
  })

  it('takes the split back off the panes', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)

    toggleSplit(root, 'beside', WIDE)

    expect(panes(root)?.dataset.split).toBeUndefined()
  })
})

describe('the share of the space', () => {
  it('moves where the divider was dragged to', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)

    setSplitFraction(root, 0.6, WIDE)

    expect(readSplit().fraction).toBeCloseTo(0.6)
  })

  it('goes back to even when the workspace returns to a single pane', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)
    setSplitFraction(root, 0.6, WIDE)

    toggleSplit(root, 'beside', WIDE)

    expect(readSplit().fraction).toBe(EVEN_SPLIT)
  })

  it('survives a reload, because it is kept beside the other layout preferences', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)
    setSplitFraction(root, 0.6, WIDE)

    expect(readSplit().fraction).toBeCloseTo(0.6)
  })
})

describe('how narrow a pane may get', () => {
  it('stops the first pane shrinking past the floor', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)

    setSplitFraction(root, 0.01, WIDE)

    expect(readSplit().fraction).toBeCloseTo(MIN_PANE_WIDTH_PX / WIDE)
  })

  it('stops the second pane shrinking past the floor', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)

    setSplitFraction(root, 0.99, WIDE)

    expect(readSplit().fraction).toBeCloseTo(1 - MIN_PANE_WIDTH_PX / WIDE)
  })

  it('uses a shorter floor over and under, where a pane needs less room', () => {
    const root = page()
    toggleSplit(root, 'below', TALL)

    setSplitFraction(root, 0.01, TALL)

    expect(readSplit().fraction).toBeCloseTo(MIN_PANE_HEIGHT_PX / TALL)
  })

  it('pins an axis too small for two panes at an even share, rather than refusing', () => {
    const root = page()
    toggleSplit(root, 'beside', NARROWER_THAN_TWO_PANES)

    setSplitFraction(root, 0.9, NARROWER_THAN_TWO_PANES)

    expect(readSplit().fraction).toBe(EVEN_SPLIT)
  })
})

describe('a stored split that makes no sense', () => {
  it('is ignored when the share is not a number', () => {
    localStorage.setItem(TestOnly.SPLIT_KEY, JSON.stringify({ orientation: 'beside', shares: { beside: 'half' } }))

    expect(readSplit().fraction).toBe(EVEN_SPLIT)
  })

  it('is ignored when the share is a number no divider could sit at', () => {
    localStorage.setItem(
      TestOnly.SPLIT_KEY,
      JSON.stringify({ orientation: 'beside', shares: { beside: Number.POSITIVE_INFINITY } }),
    )

    expect(readSplit().fraction).toBe(EVEN_SPLIT)
  })

  it('is ignored when the shares are not a record of them', () => {
    localStorage.setItem(TestOnly.SPLIT_KEY, JSON.stringify({ orientation: 'beside', shares: 'half' }))

    expect(readSplit().fraction).toBe(EVEN_SPLIT)
  })

  it('is ignored when the orientation is not one this build has', () => {
    localStorage.setItem(TestOnly.SPLIT_KEY, JSON.stringify({ orientation: 'diagonal', fraction: 0.5 }))

    expect(readSplit().orientation).toBeNull()
  })

  it('is ignored when it is not an object at all', () => {
    localStorage.setItem(TestOnly.SPLIT_KEY, JSON.stringify('beside'))

    expect(readSplit().orientation).toBeNull()
  })
})

describe('a share set while there is nothing to share', () => {
  it('is ignored, because an unsplit workspace has no ratio', () => {
    const root = page()

    setSplitFraction(root, 0.7, WIDE)

    expect(readSplit().fraction).toBe(EVEN_SPLIT)
  })
})

describe('panes with no divider in them', () => {
  it('are left alone rather than half-arranged', () => {
    const bare = document.createElement('div')
    bare.innerHTML = '<div data-part="panes"></div>'
    document.body.append(bare)

    applySplit(bare, WIDE)

    expect(bare.querySelector<HTMLElement>('[data-part="panes"]')?.dataset.split).toBeUndefined()
  })
})

describe('a page with no panes to arrange', () => {
  it('is left alone rather than failing', () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    applySplit(bare, WIDE)

    expect(bare.childElementCount).toBe(0)
  })
})

describe('a divider set in one orientation', () => {
  const NARROWER = 0.3
  const WIDER = 0.7

  it('is kept when the reader switches to the other orientation', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)
    setSplitFraction(root, NARROWER, WIDE)

    toggleSplit(root, 'below', TALL)

    expect(readSplit().fraction).toBe(EVEN_SPLIT)
  })

  it('comes back when the reader switches to that orientation again', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)
    setSplitFraction(root, NARROWER, WIDE)
    toggleSplit(root, 'below', TALL)
    setSplitFraction(root, WIDER, TALL)

    toggleSplit(root, 'beside', WIDE)

    expect(readSplit().fraction).toBe(NARROWER)
  })

  it('does not move the other orientation, which is what sharing one ratio did', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)
    setSplitFraction(root, NARROWER, WIDE)
    toggleSplit(root, 'below', TALL)

    setSplitFraction(root, WIDER, TALL)
    toggleSplit(root, 'beside', WIDE)

    expect(readSplit().fraction).toBe(NARROWER)
  })
})

describe('a split the reader has dismissed', () => {
  const NARROWER = 0.3

  it('forgets what the divider was, so the next split of that orientation opens even', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)
    setSplitFraction(root, NARROWER, WIDE)

    toggleSplit(root, 'beside', WIDE)
    toggleSplit(root, 'beside', WIDE)

    expect(readSplit().fraction).toBe(EVEN_SPLIT)
  })

  it('forgets the other orientation too, because the ratio belongs to a split that exists', () => {
    const root = page()
    toggleSplit(root, 'below', TALL)
    setSplitFraction(root, NARROWER, TALL)

    toggleSplit(root, 'below', TALL)
    toggleSplit(root, 'below', TALL)

    expect(readSplit().fraction).toBe(EVEN_SPLIT)
  })
})

describe('the divider between the panes', () => {
  it('says what its number counts, so it is not heard beside the explorer as a bare 50', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)

    expect(root.querySelector('[data-part="split-resizer"]')?.getAttribute('aria-valuetext')).toBe('50 percent')
  })

  it('says it again when the reader moves it, rather than going stale', () => {
    const root = page()
    toggleSplit(root, 'beside', WIDE)

    setSplitFraction(root, 0.3, WIDE)

    expect(root.querySelector('[data-part="split-resizer"]')?.getAttribute('aria-valuetext')).toBe('30 percent')
  })
})
