'use sanity'

import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { createHolderControl } from '../../../src/client/editor/holder.ts'
import { createEditorState } from '../../../src/client/editor/markdown-setup.ts'
import { TestOnly } from '../../../src/client/editor/images.ts'

import { trackView } from '../editor-fixtures.ts'

const { altOf } = TestOnly

const IMAGE_SELECTOR = 'img.cm-vixen-image'

function editing(doc: string, entryPath = 'notes.md'): EditorView {
  const holder = createHolderControl()
  const parent = document.createElement('div')
  document.body.append(parent)

  const view = trackView(
    new EditorView({
      parent,
      state: createEditorState({
        doc,
        selection: { anchor: doc.length },
        extensions: [holder.unset, EditorState.allowMultipleSelections.of(true)],
      }),
    }),
  )
  holder.follow(view, entryPath)

  return view
}

function rendered(view: EditorView): HTMLImageElement[] {
  return [...view.dom.querySelectorAll<HTMLImageElement>(IMAGE_SELECTOR)]
}

function sourceIsVisible(view: EditorView): boolean {
  return view.dom.textContent.includes('![')
}

function lineShows(view: EditorView): { images: number; source: boolean } {
  return { images: rendered(view).length, source: sourceIsVisible(view) }
}

const THE_IMAGE = { images: 1, source: false }
const THE_SOURCE = { images: 0, source: true }

function caretTo(view: EditorView, anchor: number): void {
  view.dispatch({ selection: { anchor } })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('an image alone on its line', () => {
  it('renders in place of its source', () => {
    const view = editing('intro\n![a](./pic.png)\ntail\n')

    expect(lineShows(view)).toStrictEqual(THE_IMAGE)
  })

  it('points at the raw route, resolved against the document holding it', () => {
    const view = editing('intro\n![a](./pic.png)\n', 'journal/2026/notes.md')

    expect(rendered(view).at(0)?.getAttribute('src')).toBe('/api/files/raw/journal/2026/pic.png')
  })

  it('carries the alt text the author wrote', () => {
    const view = editing('intro\n![a cat](./pic.png)\n')

    expect(rendered(view).at(0)?.getAttribute('alt')).toBe('a cat')
  })

  it('renders when the line has surrounding whitespace', () => {
    const view = editing('intro\n  ![a](./pic.png)  \n')

    expect(rendered(view)).toHaveLength(1)
  })
})

describe('the caret', () => {
  it('shows the source when it sits on the image line', () => {
    const view = editing('intro\n![a](./pic.png)\ntail\n')

    caretTo(view, 8)

    expect(lineShows(view)).toStrictEqual(THE_SOURCE)
  })

  it('renders the image again once it leaves', () => {
    const view = editing('intro\n![a](./pic.png)\ntail\n')
    caretTo(view, 8)

    caretTo(view, 0)

    expect(rendered(view)).toHaveLength(1)
  })

  it('shows the source when a selection merely reaches the line', () => {
    const view = editing('intro\n![a](./pic.png)\ntail\n')

    view.dispatch({ selection: { anchor: 0, head: 8 } })

    expect(rendered(view)).toHaveLength(0)
  })

  it('shows the source when a second cursor lands on the line', () => {
    const view = editing('intro\n![a](./pic.png)\ntail\n')

    view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(8)]) })

    expect(rendered(view)).toHaveLength(0)
  })
})

describe('what is left as source text', () => {
  it('an image sharing its line with prose', () => {
    const view = editing('see ![a](./pic.png) here\n')

    expect(rendered(view)).toHaveLength(0)
  })

  it('a link, which is not an image', () => {
    const view = editing('intro\n[a](./doc.md)\n')

    expect(rendered(view)).toHaveLength(0)
  })

  it('an image outside the store', () => {
    const view = editing('intro\n![a](https://example.test/p.png)\n')

    expect(rendered(view)).toHaveLength(0)
  })

  it('an image whose path climbs out of the store', () => {
    const view = editing('intro\n![a](../escape.png)\n', 'notes.md')

    expect(rendered(view)).toHaveLength(0)
  })

  it('an image inside a fenced block', () => {
    const view = editing('```\n![a](./pic.png)\n```\n')

    expect(rendered(view)).toHaveLength(0)
  })
})

describe('the alt text', () => {
  it('is what the author wrote between the brackets', () => {
    expect(altOf('![a cat](pic.png)')).toBe('a cat')
  })

  it('is empty when the author left it empty', () => {
    expect(altOf('![](pic.png)')).toBe('')
  })

  it('is empty rather than absent for markup that is not an image at all', () => {
    expect(altOf('[a link](doc.md)')).toBe('')
  })
})

describe('a pointer on the image', () => {
  it('reaches the editor, so a click can put the caret in the source', () => {
    const view = editing('intro\n![a](./pic.png)\ntail\n')
    const image = rendered(view).at(0)

    const ignored = image?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    expect(ignored).toBe(false)
  })
})

describe('an image that will not load', () => {
  it('gives the line back to its source, so the wrong path can be fixed', () => {
    const view = editing('intro\n![a](./gone.png)\ntail\n')

    rendered(view).at(0)?.dispatchEvent(new Event('error'))

    expect(lineShows(view)).toStrictEqual(THE_SOURCE)
  })

  it('does not take other images down with it', () => {
    const view = editing('![a](./gone.png)\n\n![b](./fine.png)\n')

    rendered(view).at(0)?.dispatchEvent(new Event('error'))

    expect(rendered(view).map((image) => image.getAttribute('src'))).toStrictEqual(['/api/files/raw/fine.png'])
  })

  it('stays as source text while the caret moves around it', () => {
    const view = editing('intro\n![a](./gone.png)\ntail\n')
    rendered(view).at(0)?.dispatchEvent(new Event('error'))

    caretTo(view, 8)
    caretTo(view, 0)

    expect(rendered(view)).toHaveLength(0)
  })
})
