'use sanity'

import { EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { createHolderControl } from '../../../src/client/editor/holder.ts'
import { createEditorState } from '../../../src/client/editor/markdown-setup.ts'
import { linkTargetAt } from '../../../src/client/editor/link-targets.ts'

import { trackView } from '../editor-fixtures.ts'

function editing(doc: string, entryPath = 'notes.md'): EditorView {
  const holder = createHolderControl()
  const parent = document.createElement('div')
  document.body.append(parent)

  const view = trackView(new EditorView({ parent, state: createEditorState({ doc, extensions: [holder.unset] }) }))
  holder.follow(view, entryPath)

  return view
}

function targetAt(doc: string, position: number, entryPath = 'notes.md'): string | null {
  return linkTargetAt(editing(doc, entryPath).state, position)?.target ?? null
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('the link under the caret', () => {
  it('is found with the caret in the destination', () => {
    expect(targetAt('see [the doc](other.md) here', 16)).toBe('other.md')
  })

  it('is found with the caret in the link text, where a reader would put it', () => {
    expect(targetAt('see [the doc](other.md) here', 8)).toBe('other.md')
  })

  it('is found with the caret on the opening bracket', () => {
    expect(targetAt('see [the doc](other.md) here', 4)).toBe('other.md')
  })

  it('is nothing when the caret is in ordinary prose', () => {
    expect(targetAt('see [the doc](other.md) here', 1)).toBeNull()
  })

  it('resolves against the document holding it', () => {
    expect(targetAt('[a](./b.md)', 5, 'journal/2026/notes.md')).toBe('journal/2026/b.md')
  })

  it('is an image when the caret is in one', () => {
    expect(targetAt('![a cat](pic.png)', 10)).toBe('pic.png')
  })

  it('says it is an image, so the caller can route it', () => {
    const found = linkTargetAt(editing('![a cat](pic.png)').state, 10)

    expect(found?.isImage).toBe(true)
  })
})

describe('an image inside a link', () => {
  const NESTED = '[![alt](inner.png)](outer.md)'

  it('opens the link, not the image, because the image is the label', () => {
    expect(targetAt(NESTED, 10)).toBe('outer.md')
  })

  it('opens the link from the image destination too', () => {
    expect(targetAt(NESTED, 14)).toBe('outer.md')
  })

  it('opens the link from its own destination', () => {
    expect(targetAt(NESTED, 22)).toBe('outer.md')
  })
})

describe('what the caret cannot open', () => {
  it('a destination outside the store', () => {
    expect(targetAt('[a](https://example.test/x.md)', 6)).toBeNull()
  })

  it('a path in inline code, which is being documented', () => {
    expect(targetAt('use `[a](code.md)` here', 10)).toBeNull()
  })

  it('a path in a fenced block', () => {
    expect(targetAt('```\n[a](fence.md)\n```', 8)).toBeNull()
  })

  it('a link that climbs out of the store', () => {
    expect(targetAt('[a](../escape.md)', 6)).toBeNull()
  })
})
