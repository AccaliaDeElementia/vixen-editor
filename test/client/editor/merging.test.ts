'use sanity'

import { acceptChunk, getChunks } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { createMergeControl, type MergeControl } from '../../../src/client/editor/merging.ts'

import { trackView } from '../editor-fixtures.ts'

const ON_DISK = 'alpha\ntheirs\ngamma\n'
const IN_BUFFER = 'alpha\nmine\ngamma\n'
const DIFFERING_LINE = { from: 6, to: 10 }

interface Harness {
  view: EditorView
  merging: MergeControl
  resolved: { count: number }
}

function editorShowing(buffer: string): Harness {
  const resolved = { count: 0 }
  const merging = createMergeControl(() => {
    resolved.count += 1
  })

  const parent = document.createElement('div')
  document.body.append(parent)

  const view = trackView(
    new EditorView({
      parent,
      state: EditorState.create({
        doc: buffer,
        extensions: [
          merging.inactive,
          EditorView.updateListener.of((update) => {
            merging.endWhenResolved(update.view)
          }),
        ],
      }),
    }),
  )

  return { view, merging, resolved }
}

function changedLines(view: EditorView): number {
  return view.dom.querySelectorAll('.cm-changedLine').length
}

function strickenText(view: EditorView): string {
  return view.dom.querySelector('.cm-deletedChunk')?.textContent ?? ''
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('beginning a merge', () => {
  it('marks nothing until one begins', () => {
    const { view } = editorShowing(IN_BUFFER)

    expect(changedLines(view)).toBe(0)
  })

  it('marks the lines that differ from what is on disk', () => {
    const { view, merging } = editorShowing(IN_BUFFER)

    merging.begin(view, ON_DISK)

    expect(changedLines(view)).toBe(1)
  })

  it('shows the stored version as the side being replaced, not the buffer', () => {
    const { view, merging } = editorShowing(IN_BUFFER)

    merging.begin(view, ON_DISK)

    expect(strickenText(view)).toContain('theirs')
  })

  it('does not strike the buffer, which is the side being kept', () => {
    const { view, merging } = editorShowing(IN_BUFFER)

    merging.begin(view, ON_DISK)

    expect(strickenText(view)).not.toContain('mine')
  })

  it('leaves the buffer as it was, so nothing is resolved by opening the view', () => {
    const { view, merging } = editorShowing(IN_BUFFER)

    merging.begin(view, ON_DISK)

    expect(view.state.doc.toString()).toBe(IN_BUFFER)
  })

  it('offers an accept and a reject for each difference', () => {
    const { view, merging } = editorShowing(IN_BUFFER)

    merging.begin(view, ON_DISK)

    expect(view.dom.querySelectorAll('.cm-chunkButtons button')).toHaveLength(2)
  })
})

describe('resolving every difference', () => {
  it('removes the overlay', () => {
    const { view, merging } = editorShowing(IN_BUFFER)
    merging.begin(view, ON_DISK)

    view.dispatch({ changes: { ...DIFFERING_LINE, insert: 'theirs' } })

    expect(changedLines(view)).toBe(0)
  })

  it('reports it once, and not again on the next edit', () => {
    const harness = editorShowing(IN_BUFFER)
    harness.merging.begin(harness.view, ON_DISK)

    harness.view.dispatch({ changes: { ...DIFFERING_LINE, insert: 'theirs' } })
    harness.view.dispatch({ changes: { from: 0, insert: 'later edit ' } })

    expect(harness.resolved.count).toBe(1)
  })
})

describe('accepting a difference, which leaves the buffer untouched', () => {
  it('still takes the overlay down, because the difference is gone', () => {
    const harness = editorShowing(IN_BUFFER)
    harness.merging.begin(harness.view, ON_DISK)

    acceptChunk(harness.view, getChunks(harness.view.state)?.chunks[0]?.fromB ?? 0)

    expect(changedLines(harness.view)).toBe(0)
  })

  it('leaves the buffer as it was, since accepting means keeping it', () => {
    const harness = editorShowing(IN_BUFFER)
    harness.merging.begin(harness.view, ON_DISK)

    acceptChunk(harness.view, getChunks(harness.view.state)?.chunks[0]?.fromB ?? 0)

    expect(harness.view.state.doc.toString()).toBe(IN_BUFFER)
  })

  it('reports the merge resolved, so the caller can stop warning', () => {
    const harness = editorShowing(IN_BUFFER)
    harness.merging.begin(harness.view, ON_DISK)

    acceptChunk(harness.view, getChunks(harness.view.state)?.chunks[0]?.fromB ?? 0)

    expect(harness.resolved.count).toBe(1)
  })
})

describe('resolving only some of the differences', () => {
  it('keeps the overlay, because there is still a decision to make', () => {
    const harness = editorShowing('alpha\nmine\ngamma\nmine again\n')
    harness.merging.begin(harness.view, 'alpha\ntheirs\ngamma\ntheirs again\n')

    harness.view.dispatch({ changes: { ...DIFFERING_LINE, insert: 'theirs' } })

    expect(changedLines(harness.view)).toBe(1)
  })

  it('reports nothing resolved while a decision is outstanding', () => {
    const harness = editorShowing('alpha\nmine\ngamma\nmine again\n')
    harness.merging.begin(harness.view, 'alpha\ntheirs\ngamma\ntheirs again\n')

    harness.view.dispatch({ changes: { ...DIFFERING_LINE, insert: 'theirs' } })

    expect(harness.resolved.count).toBe(0)
  })
})

describe('an editor that is not merging', () => {
  it('is left alone by an edit, rather than reported as a finished merge', () => {
    const harness = editorShowing(IN_BUFFER)

    harness.view.dispatch({ changes: { from: 0, insert: 'typing ' } })

    expect(harness.resolved.count).toBe(0)
  })
})
