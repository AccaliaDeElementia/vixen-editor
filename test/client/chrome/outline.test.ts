'use sanity'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createOutline, TestOnly } from '../../../src/client/chrome/outline.ts'
import { FILES_PANEL, OUTLINE_PANEL, showPanel } from '../../../src/client/platform/panels.ts'
import { readPreferences, writePreferences } from '../../../src/client/platform/preferences.ts'

import { given } from '../../conditions.ts'
import { renderSection } from '../templates.ts'

const { OUTLINE_SETTLES_MS } = TestOnly

const TWO_HEADINGS = 2
const A_SECOND_HEADING = '## two'
const TWO_HEADINGS_IN = `# one\n\n${A_SECOND_HEADING}\n`
const SECOND_HEADING_STARTS_AT = TWO_HEADINGS_IN.indexOf(A_SECOND_HEADING)

const A_QUOTED_HEADING = '> # theirs'
const QUOTING_ANOTHER_DOCUMENT = `# mine\n\n${A_QUOTED_HEADING}\n`

const QUOTED_TOGGLE = '[data-part="outline-quoted"]'

const SIDEBAR = `
  <div id="app">
    <section class="panel" data-panel="files"></section>
    ${renderSection('[data-panel="outline"]')}
  </div>
`

let root: HTMLElement = document.createElement('div')
let chosen: number[] = []
let held: string | null = TWO_HEADINGS_IN
let standing: Array<() => void> = []

function outlining(): ReturnType<typeof createOutline> {
  const outline = createOutline({
    root,
    source: () => held,
    chosen: (offset: number) => {
      chosen.push(offset)
    },
  })
  standing.push(outline.stop)

  return outline
}

function listing(markdown: string | null): ReturnType<typeof createOutline> {
  held = markdown
  const outline = outlining()
  outline.show()

  return outline
}

function rowsShown(): Array<string | null> {
  return [...root.querySelectorAll('[data-part="outline-list"] li')].map((row) => row.textContent)
}

function depthsShown(): string[] {
  return [...root.querySelectorAll<HTMLElement>('[data-part="outline-list"] button')].map((row) =>
    row.style.getPropertyValue('--depth'),
  )
}

function pressRow(index: number): void {
  root.querySelectorAll<HTMLElement>('[data-part="outline-list"] button')[index]?.click()
}

function pressQuoted(): void {
  root.querySelector<HTMLElement>(QUOTED_TOGGLE)?.click()
}

function quotedIsPressed(): string | null {
  return root.querySelector(QUOTED_TOGGLE)?.getAttribute('aria-pressed') ?? null
}

function saidInstead(): string {
  const said = root.querySelector<HTMLElement>('[data-part="outline-empty"]')

  return said?.hidden === false ? said.textContent : ''
}

beforeEach(() => {
  localStorage.clear()
  chosen = []
  standing = []
  held = TWO_HEADINGS_IN
  document.body.innerHTML = ''
  root = document.createElement('div')
  root.innerHTML = SIDEBAR
  document.body.append(root)
  showPanel(root, OUTLINE_PANEL)
})

afterEach(() => {
  for (const stop of standing.splice(0)) stop()
  vi.useRealTimers()
})

describe('the headings the outline lists', () => {
  it('shows one row for each heading, in the order the document holds them', () => {
    listing('# one\n\n## two\n\n# three\n')

    expect(rowsShown()).toStrictEqual(['one', 'two', 'three'])
  })

  it('indents a row by how deep under the top its heading sits', () => {
    listing('# top\n\n### deep\n')

    expect(depthsShown()).toStrictEqual(['0', '2'])
  })

  it('replaces what it listed before, rather than listing the document twice', () => {
    const outline = listing('# first\n')
    held = '# second\n'

    outline.show()

    expect(rowsShown()).toStrictEqual(['second'])
  })

  it('lists nothing while another panel is the one showing, because nobody is looking', () => {
    showPanel(root, FILES_PANEL)

    listing(TWO_HEADINGS_IN)

    expect(rowsShown()).toStrictEqual([])
  })
})

describe('pressing a heading in the outline', () => {
  it('offers each heading as a button, because a row with nowhere to go is not a route into the document', () => {
    listing(TWO_HEADINGS_IN)

    expect(root.querySelectorAll('[data-part="outline-list"] button')).toHaveLength(TWO_HEADINGS)
  })

  it('gives back where that heading starts, which is where the caret belongs', () => {
    listing(TWO_HEADINGS_IN)

    pressRow(1)

    expect(chosen).toStrictEqual([SECOND_HEADING_STARTS_AT])
  })

  it('asks nothing of a reader who presses nothing', () => {
    listing('# one\n')

    expect(chosen).toStrictEqual([])
  })
})

describe('a document edited under the outline', () => {
  it('keeps the rows it built when nothing about the headings changed, rather than building them again', () => {
    const outline = listing(TWO_HEADINGS_IN)
    const [first] = [...root.querySelectorAll('[data-part="outline-list"] li')]

    outline.show()

    expect([...root.querySelectorAll('[data-part="outline-list"] li')][0]).toBe(first)
  })

  it('moves where a row jumps to when the text above it grows', () => {
    const outline = listing(TWO_HEADINGS_IN)
    const grown = `# one\n\nsome prose\n\n${A_SECOND_HEADING}\n`
    held = grown
    outline.show()

    pressRow(1)

    expect(chosen).toStrictEqual([grown.indexOf(A_SECOND_HEADING)])
  })

  it('builds the rows again once a heading itself changes', () => {
    const outline = listing(TWO_HEADINGS_IN)
    held = '# one\n\n## renamed\n'

    outline.show()

    expect(rowsShown()).toStrictEqual(['one', 'renamed'])
  })
})

describe('an outline asked to refresh while the reader is still typing', () => {
  it('waits for the typing to settle, rather than parsing once a keystroke', async () => {
    vi.useFakeTimers()
    const outline = listing(TWO_HEADINGS_IN)
    held = '# one\n\n## renamed\n'

    outline.refreshSoon()
    await vi.advanceTimersByTimeAsync(OUTLINE_SETTLES_MS - 1)

    expect(rowsShown()).toStrictEqual(['one', 'two'])
  })

  it('redraws once the typing has settled', async () => {
    vi.useFakeTimers()
    const outline = listing(TWO_HEADINGS_IN)
    held = '# one\n\n## renamed\n'

    outline.refreshSoon()
    await vi.advanceTimersByTimeAsync(OUTLINE_SETTLES_MS)

    expect(rowsShown()).toStrictEqual(['one', 'renamed'])
  })

  it('draws once for a burst, not once for each keystroke in it', async () => {
    vi.useFakeTimers()
    const outline = listing(TWO_HEADINGS_IN)
    held = '# one\n\n## renamed\n'

    outline.refreshSoon()
    await vi.advanceTimersByTimeAsync(OUTLINE_SETTLES_MS - 1)
    outline.refreshSoon()
    await vi.advanceTimersByTimeAsync(OUTLINE_SETTLES_MS - 1)

    expect(rowsShown()).toStrictEqual(['one', 'two'])
  })

  it('draws nothing more once it has been stopped, because the editor it watched has gone', async () => {
    vi.useFakeTimers()
    const outline = listing(TWO_HEADINGS_IN)
    held = '# one\n\n## renamed\n'
    outline.refreshSoon()

    outline.stop()
    await vi.advanceTimersByTimeAsync(OUTLINE_SETTLES_MS)

    expect(rowsShown()).toStrictEqual(['one', 'two'])
  })
})

describe('what the outline says when it has no heading to list', () => {
  it('says the document has none, rather than showing an empty list and no reason', () => {
    listing('prose with no heading\n')

    expect(saidInstead()).toBe('This document has no headings.')
  })

  it('says nothing is open where no document is, which is a different thing', () => {
    listing(null)

    expect(saidInstead()).toBe('Nothing is open.')
  })

  it('tells the two apart, rather than leaving the first message standing', () => {
    const outline = listing(null)
    given(() => {
      expect(saidInstead()).toBe('Nothing is open.')
    })
    held = 'prose with no heading\n'

    outline.show()

    expect(saidInstead()).toBe('This document has no headings.')
  })

  it('takes the message away once there is something to list', () => {
    const outline = listing(null)
    held = '# back\n'

    outline.show()

    expect(saidInstead()).toBe('')
  })
})

describe('a page with no outline panel in it', () => {
  it('is left alone, rather than throwing on the way past', () => {
    root.querySelector('[data-panel="outline"]')?.replaceChildren()

    expect(() => {
      listing(null)
    }).not.toThrow()
  })

  it('leaves a panel missing half its parts alone, rather than filling the half that is there', () => {
    root.querySelector('[data-part="outline-empty"]')?.remove()

    listing('# one\n')

    expect(rowsShown()).toStrictEqual([])
  })
})

describe('headings the document is quoting rather than writing', () => {
  it('leaves one out, because it belongs to the document being quoted', () => {
    listing(QUOTING_ANOTHER_DOCUMENT)

    expect(rowsShown()).toStrictEqual(['mine'])
  })

  it('lists it once the reader asks for quoted headings', () => {
    listing(QUOTING_ANOTHER_DOCUMENT)

    pressQuoted()

    expect(rowsShown()).toStrictEqual(['mine', 'theirs'])
  })

  it('leaves it out again when the reader asks a second time', () => {
    listing(QUOTING_ANOTHER_DOCUMENT)
    pressQuoted()
    given(() => {
      expect(rowsShown()).toStrictEqual(['mine', 'theirs'])
    })

    pressQuoted()

    expect(rowsShown()).toStrictEqual(['mine'])
  })

  it('says where every heading went, rather than claiming the document has none', () => {
    listing(`${A_QUOTED_HEADING}\n`)

    expect(saidInstead()).toBe('Every heading here is inside a quote.')
  })

  it('remembers what the reader asked for, so they ask once rather than once a document', () => {
    listing(QUOTING_ANOTHER_DOCUMENT)

    pressQuoted()

    expect(readPreferences().quotedHeadings).toBe(true)
  })
})

describe('the control that asks for quoted headings', () => {
  it('starts unpressed, which is the outline a reader starts with', () => {
    outlining()

    expect(quotedIsPressed()).toBe('false')
  })

  it('starts pressed when the reader asked for them on this machine before', () => {
    writePreferences({ ...readPreferences(), quotedHeadings: true })

    outlining()

    expect(quotedIsPressed()).toBe('true')
  })

  it('says it is pressed once the reader presses it, because the icon alone says nothing', () => {
    listing(QUOTING_ANOTHER_DOCUMENT)

    pressQuoted()

    expect(quotedIsPressed()).toBe('true')
  })

  it('leaves a panel with no such control alone, rather than throwing on the way past', () => {
    root.querySelector(QUOTED_TOGGLE)?.remove()

    expect(() => {
      listing(QUOTING_ANOTHER_DOCUMENT)
    }).not.toThrow()
  })
})
