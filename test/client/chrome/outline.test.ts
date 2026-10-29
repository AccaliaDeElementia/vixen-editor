'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { showOutline } from '../../../src/client/chrome/outline.ts'

const SIDEBAR = `
  <section class="panel" data-panel="outline">
    <p class="panel__empty" data-part="outline-empty" hidden></p>
    <ul class="outline" data-part="outline-list"></ul>
  </section>
`

const TWO_HEADINGS = 2
const A_SECOND_HEADING = '## two'
const TWO_HEADINGS_IN = `# one\n\n${A_SECOND_HEADING}\n`
const SECOND_HEADING_STARTS_AT = TWO_HEADINGS_IN.indexOf(A_SECOND_HEADING)

let root: HTMLElement = document.createElement('div')
let chosen: number[] = []

function listing(markdown: string | null): void {
  showOutline(root, markdown, (offset: number) => {
    chosen.push(offset)
  })
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

function saidInstead(): string {
  const said = root.querySelector<HTMLElement>('[data-part="outline-empty"]')

  return said?.hidden === false ? said.textContent : ''
}

beforeEach(() => {
  chosen = []
  document.body.innerHTML = ''
  root = document.createElement('div')
  root.innerHTML = SIDEBAR
  document.body.append(root)
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
    listing('# first\n')

    listing('# second\n')

    expect(rowsShown()).toStrictEqual(['second'])
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

describe('what the outline says when it has no heading to list', () => {
  it('says the document has none, rather than showing an empty list and no reason', () => {
    listing('prose with no heading\n')

    expect(saidInstead()).toBe('This document has no headings.')
  })

  it('says nothing is open where no document is, which is a different thing', () => {
    listing(null)

    expect(saidInstead()).toBe('Nothing is open.')
  })

  it('takes the message away once there is something to list', () => {
    listing(null)

    listing('# back\n')

    expect(saidInstead()).toBe('')
  })
})

describe('a page with no outline panel in it', () => {
  it('is left alone, rather than throwing on the way past', () => {
    root.replaceChildren()

    expect(() => {
      listing(null)
    }).not.toThrow()
  })

  it('leaves a panel missing half its parts alone, rather than filling the half that is there', () => {
    root.innerHTML = '<section data-panel="outline"><ul data-part="outline-list"></ul></section>'

    listing('# one\n')

    expect(rowsShown()).toStrictEqual([])
  })
})
