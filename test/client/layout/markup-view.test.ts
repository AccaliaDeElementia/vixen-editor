'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createMarkupView } from '../../../src/client/layout/markup-view.ts'

import { renderPane } from '../templates.ts'

let host: HTMLElement = document.createElement('div')

function ignoringClicks(): void {
  return undefined
}

function page(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderPane()
  document.body.append(container)

  return container
}

function body(): HTMLElement | null {
  return host.querySelector<HTMLElement>('[data-part="markup-body"]')
}

beforeEach(() => {
  document.body.innerHTML = ''
  host = page()
})

describe('showing a document rendered', () => {
  it('renders a heading as a heading rather than as its markup', () => {
    createMarkupView(host, ignoringClicks).show('# A heading')

    expect(body()?.querySelector('h1')?.textContent).toBe('A heading')
  })

  it('renders emphasis as emphasis', () => {
    createMarkupView(host, ignoringClicks).show('a **bold** word')

    expect(body()?.querySelector('strong')?.textContent).toBe('bold')
  })

  it('replaces what it rendered before rather than appending', () => {
    const markup = createMarkupView(host, ignoringClicks)
    markup.show('# first')

    markup.show('# second')

    expect(body()?.querySelectorAll('h1')).toHaveLength(1)
  })

  it('shows raw HTML as source rather than running it', () => {
    createMarkupView(host, ignoringClicks).show('<img src=x onerror="window.pwned = 1">')

    expect(body()?.querySelector('img')).toBeNull()
  })
})

describe('a pane with nowhere to render', () => {
  it('declines rather than failing', () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    createMarkupView(bare, ignoringClicks).show('# ignored')

    expect(bare.childElementCount).toBe(0)
  })

  it('has nothing to scroll to either', () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    expect(() => {
      createMarkupView(bare, ignoringClicks).revealOffset(0)
    }).not.toThrow()
  })
})

describe('following the caret', () => {
  function scrolledFrom(markdown: string, caret: number): string | undefined {
    const markup = createMarkupView(host, ignoringClicks)
    markup.show(markdown)

    const reached: string[] = []
    for (const block of host.querySelectorAll<HTMLElement>('[data-from]')) {
      block.scrollIntoView = () => {
        reached.push(block.dataset.from ?? '')
      }
    }

    markup.revealOffset(caret)

    return reached.at(-1)
  }

  it('brings the block the caret sits in into view', () => {
    expect(scrolledFrom('# one\n\n# two\n\n# three', 8)).toBe('7')
  })

  it('stays on the first block while the caret is still in it', () => {
    expect(scrolledFrom('# one\n\n# two', 2)).toBe('0')
  })

  it('reaches the last block when the caret is at the end', () => {
    expect(scrolledFrom('# one\n\n# two\n\n# three', 20)).toBe('14')
  })

  it('scrolls nothing when the document has no blocks to scroll to', () => {
    expect(scrolledFrom('', 0)).toBeUndefined()
  })

  it('scrolls nothing when the caret sits before the first block', () => {
    const markup = createMarkupView(host, ignoringClicks)
    markup.show('\n\n# one')
    const reached: string[] = []
    for (const block of host.querySelectorAll<HTMLElement>('[data-from]')) {
      block.scrollIntoView = () => {
        reached.push(block.dataset.from ?? '')
      }
    }

    markup.revealOffset(0)

    expect(reached).toStrictEqual([])
  })
})

describe('clicking a rendered block', () => {
  function clickedOffsets(markdown: string, selector: string): number[] {
    const reached: number[] = []
    const markup = createMarkupView(host, (offset) => {
      reached.push(offset)
    })
    markup.show(markdown)
    host
      .querySelector<HTMLElement>(`[data-part="markup-body"] ${selector}`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    return reached
  }

  it('reports where in the source that block came from', () => {
    expect(clickedOffsets('# one\n\n# two', 'h1:last-of-type')).toStrictEqual([7])
  })

  it('reports the first block when the first is clicked', () => {
    expect(clickedOffsets('# one\n\n# two', 'h1')).toStrictEqual([0])
  })

  it('reports the block a click inside marked-up text belongs to', () => {
    expect(clickedOffsets('# one\n\nA **bold** word', 'strong')).toStrictEqual([7])
  })

  it('reports nothing for a click that is in no block at all', () => {
    const reached: number[] = []
    const markup = createMarkupView(host, (offset) => {
      reached.push(offset)
    })
    markup.show('# one')

    host
      .querySelector<HTMLElement>('[data-part="markup-body"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(reached).toStrictEqual([])
  })

  it('reports the innermost block when blocks are nested', () => {
    expect(clickedOffsets('- outer\n\n  - inner', 'li li p')).toStrictEqual([13])
  })
})
