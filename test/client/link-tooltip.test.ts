'use sanity'

import { closeHoverTooltips, EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { createHolderControl } from '../../src/client/editor/holder.ts'
import { createEditorState } from '../../src/client/editor/markdown-setup.ts'
import { TestOnly } from '../../src/client/editor/link-tooltip.ts'

const { dismissHoverTooltips, linkTooltipAt } = TestOnly

function editing(doc: string, entryPath = 'notes.md'): EditorView {
  const holder = createHolderControl()
  const parent = document.createElement('div')
  document.body.append(parent)

  const view = new EditorView({ parent, state: createEditorState({ doc, extensions: [holder.unset] }) })
  holder.follow(view, entryPath)

  return view
}

function tooltipAt(doc: string, position: number, entryPath = 'notes.md'): ReturnType<typeof linkTooltipAt> {
  return linkTooltipAt(editing(doc, entryPath), position)
}

function renderedAt(doc: string, position: number, entryPath = 'notes.md'): HTMLElement | null {
  const tooltip = tooltipAt(doc, position, entryPath)

  return tooltip === null ? null : tooltip.create(editing(doc, entryPath)).dom
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('hovering a link', () => {
  it('offers to open the document it resolves to', () => {
    expect(renderedAt('see [the doc](other.md) here', 8)?.textContent).toBe('Open other.md')
  })

  it('names the target relative to the document holding the link', () => {
    expect(renderedAt('[a](./b.md)', 5, 'journal/2026/notes.md')?.textContent).toBe('Open journal/2026/b.md')
  })

  it('offers a real link, so it can be opened, copied or middle-clicked', () => {
    const anchor = renderedAt('[a](other.md)', 5)?.querySelector('a')

    expect(anchor?.getAttribute('href')).toBe('/doc/other.md')
  })

  it('spans the whole link, so the pointer can rest anywhere on it', () => {
    const tooltip = tooltipAt('see [the doc](other.md) here', 8)

    expect({ pos: tooltip?.pos, end: tooltip?.end }).toStrictEqual({ pos: 4, end: 23 })
  })

  it('sits above the line, leaving what is being read uncovered', () => {
    expect(tooltipAt('[a](other.md)', 5)?.above).toBe(true)
  })

  it('offers an image, which opens the same way', () => {
    expect(renderedAt('![a cat](pic.png)', 10)?.textContent).toBe('Open pic.png')
  })
})

describe('hovering anything else', () => {
  it.each([
    ['ordinary prose', 'see [the doc](other.md) here', 1],
    ['a destination outside the store', '[a](https://example.test/x.md)', 6],
    ['a path inside inline code', 'use `[a](code.md)` here', 10],
    ['a link that climbs out of the store', '[a](../escape.md)', 6],
  ])('offers nothing over %s', (_case, doc, position) => {
    expect(tooltipAt(doc, position)).toBeNull()
  })
})

describe('pressing Escape', () => {
  it('clears any hover tooltip that is showing', () => {
    const view = editing('[a](other.md)')
    const sent: unknown[] = []
    view.dispatch = (...specs) => {
      sent.push(...specs)
    }

    dismissHoverTooltips(view)

    expect(sent).toStrictEqual([{ effects: closeHoverTooltips }])
  })

  it('lets the key travel on, so nothing else loses its Escape', () => {
    expect(dismissHoverTooltips(editing('[a](other.md)'))).toBe(false)
  })
})
