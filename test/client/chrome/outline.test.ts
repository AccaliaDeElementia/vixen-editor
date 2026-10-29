'use sanity'

import { EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { createEditorState } from '../../../src/client/editing/markdown-setup.ts'
import { showOutline } from '../../../src/client/chrome/outline.ts'

import { trackView } from '../editor-fixtures.ts'

const SIDEBAR = `
  <section class="panel" data-panel="outline">
    <p class="panel__empty" data-part="outline-empty" hidden></p>
    <ul class="outline" data-part="outline-list"></ul>
  </section>
`

let root: HTMLElement = document.createElement('div')

function holding(markdown: string): EditorView {
  const parent = document.createElement('div')
  document.body.append(parent)

  return trackView(new EditorView({ parent, state: createEditorState({ doc: markdown }) }))
}

function rowsShown(): Array<string | null> {
  return [...root.querySelectorAll('[data-part="outline-list"] li')].map((row) => row.textContent)
}

function depthsShown(): string[] {
  return [...root.querySelectorAll<HTMLElement>('[data-part="outline-list"] li')].map((row) =>
    row.style.getPropertyValue('--depth'),
  )
}

function saidInstead(): string {
  const said = root.querySelector<HTMLElement>('[data-part="outline-empty"]')

  return said?.hidden === false ? said.textContent : ''
}

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div')
  root.innerHTML = SIDEBAR
  document.body.append(root)
})

describe('the headings the outline lists', () => {
  it('shows one row for each heading, in the order the document holds them', () => {
    showOutline(root, holding('# one\n\n## two\n\n# three\n').state)

    expect(rowsShown()).toStrictEqual(['one', 'two', 'three'])
  })

  it('indents a row by how deep under the top its heading sits', () => {
    showOutline(root, holding('# top\n\n### deep\n').state)

    expect(depthsShown()).toStrictEqual(['0', '2'])
  })

  it('replaces what it listed before, rather than listing the document twice', () => {
    showOutline(root, holding('# first\n').state)

    showOutline(root, holding('# second\n').state)

    expect(rowsShown()).toStrictEqual(['second'])
  })
})

describe('what the outline says when it has no heading to list', () => {
  it('says the document has none, rather than showing an empty list and no reason', () => {
    showOutline(root, holding('prose with no heading\n').state)

    expect(saidInstead()).toBe('This document has no headings.')
  })

  it('says nothing is open where no document is, which is a different thing', () => {
    showOutline(root, null)

    expect(saidInstead()).toBe('Nothing is open.')
  })

  it('takes the message away once there is something to list', () => {
    showOutline(root, null)

    showOutline(root, holding('# back\n').state)

    expect(saidInstead()).toBe('')
  })
})

describe('a page with no outline panel in it', () => {
  it('is left alone, rather than throwing on the way past', () => {
    root.replaceChildren()

    expect(() => {
      showOutline(root, null)
    }).not.toThrow()
  })

  it('leaves a panel missing half its parts alone, rather than filling the half that is there', () => {
    root.innerHTML = '<section data-panel="outline"><ul data-part="outline-list"></ul></section>'

    showOutline(root, holding('# one\n').state)

    expect(rowsShown()).toStrictEqual([])
  })
})
