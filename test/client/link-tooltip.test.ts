'use sanity'

import type { TransactionSpec } from '@codemirror/state'
import { closeHoverTooltips, EditorView, hasHoverTooltips } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { createHolderControl } from '../../src/client/editor/holder.ts'
import { createEditorState } from '../../src/client/editor/markdown-setup.ts'
import { TestOnly } from '../../src/client/editor/link-tooltip.ts'
import { cast } from '../cast.ts'

const { dismissHoverTooltips, linkTooltipAt, revealOnTap, whenTheCaretLeaves } = TestOnly

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

function aTap(): PointerEvent {
  return new PointerEvent('pointerup', { pointerType: 'touch', clientX: 60, clientY: 8 })
}

describe('a tap, which is the only gesture touch has', () => {
  it('opens the tooltip over a link', () => {
    const view = editing('see [the doc](other.md) here')

    revealOnTap(aTap(), view)

    expect(hasHoverTooltips(view.state)).toBe(true)
  })

  it('leaves the event for the editor, so the caret still lands', () => {
    const view = editing('see [the doc](other.md) here')

    expect(revealOnTap(aTap(), view)).toBe(false)
  })

  it('opens nothing over ordinary prose', () => {
    const view = editing('just some prose with no link in it at all')

    revealOnTap(aTap(), view)

    expect(hasHoverTooltips(view.state)).toBe(false)
  })

  it('opens nothing where there is no text under the finger', () => {
    const view = editing('see [the doc](other.md) here')
    view.posAtCoords = cast<EditorView['posAtCoords']>(() => null)

    revealOnTap(aTap(), view)

    expect(hasHoverTooltips(view.state)).toBe(false)
  })

  it('is ignored when it came from a mouse, which has hover instead', () => {
    const view = editing('see [the doc](other.md) here')
    const fromMouse = new PointerEvent('pointerup', { pointerType: 'mouse', clientX: 1, clientY: 1 })

    revealOnTap(fromMouse, view)

    expect(hasHoverTooltips(view.state)).toBe(false)
  })
})

describe('the tooltip a tap opened', () => {
  const OVER_THE_LINK = { from: 4, to: 23 }
  const DOC = 'see [the doc](other.md) here'

  function closesOn(spec: TransactionSpec): boolean {
    const view = editing(DOC)

    return whenTheCaretLeaves(OVER_THE_LINK.from, OVER_THE_LINK.to)(view.state.update(spec))
  }

  it('stays while the caret is still somewhere on the link', () => {
    expect(closesOn({ selection: { anchor: 10 } })).toBe(false)
  })

  it.each([
    ['its first character', OVER_THE_LINK.from],
    ['its last', OVER_THE_LINK.to],
  ])('stays with the caret on %s, which is still the link', (_label, anchor) => {
    expect(closesOn({ selection: { anchor } })).toBe(false)
  })

  it('closes when the caret moves off the link', () => {
    expect(closesOn({ selection: { anchor: 1 } })).toBe(true)
  })

  it('closes when the document is edited underneath it', () => {
    expect(closesOn({ changes: { from: 0, insert: 'x' } })).toBe(true)
  })

  it('stays through a transaction that touches neither', () => {
    expect(closesOn({})).toBe(false)
  })
})
