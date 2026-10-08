'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { undoDepth } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import { given, givenAsync } from '../../../conditions.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
  page,
  recorded,
  sessionRecording,
  trackEditor,
  type Recorded,
} from '../../editor-fixtures.ts'

const NOTHING_UNDONE = 0
const ONE_STEP = 1

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

async function editing(
  content: string,
  pathname = '/doc/notes.md',
): Promise<{ view: EditorView; settled: () => Promise<void> }> {
  const editor = trackEditor(
    await bootstrapOrReport({
      root,
      pathname,
      session: sessionRecording(record, { load: () => Promise.resolve({ content, stored: true }) }),
      files: filesAnsweringEmpty(),
      dialogs: dialogsDismissing(),
    }),
  )
  if (editor === null) throw new Error('the editor did not start')
  await givenAsync(editor.settled())

  return editor
}

function caretAt(view: EditorView, position: number): void {
  view.dispatch({ selection: { anchor: position } })
}

function press(part: string): void {
  root.querySelector<HTMLElement>(`[data-part="${part}"]`)?.click()
}

function chord(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }))
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('the editing control bar', () => {
  it('puts the mark around the caret, so a reader can type between the halves', async () => {
    const { view } = await editing('a line')
    given(() => {
      caretAt(view, 2)
    })

    press('format-bold')

    expect(view.state.doc.toString()).toBe('a ****line')
  })

  it('puts a prefix on the line the caret is on', async () => {
    const { view } = await editing('a line')
    given(() => {
      caretAt(view, 3)
    })

    press('format-quote')

    expect(view.state.doc.toString()).toBe('> a line')
  })

  it('takes the prefix off again, so the same control is the way back', async () => {
    const { view } = await editing('> a line')
    given(() => {
      caretAt(view, 3)
    })

    press('format-quote')

    expect(view.state.doc.toString()).toBe('a line')
  })

  it('makes a link at the caret, leaving the label and the target to be typed', async () => {
    const { view } = await editing('a line')
    given(() => {
      caretAt(view, 2)
    })

    press('format-link')

    expect(view.state.doc.toString()).toBe('a []()line')
  })

  it('is one undo step, so a press can be taken back in one', async () => {
    const { view } = await editing('a line')
    given(() => {
      expect(undoDepth(view.state)).toBe(NOTHING_UNDONE)
    })

    press('format-list')

    expect(undoDepth(view.state)).toBe(ONE_STEP)
  })

  it('leaves the keyboard in the editor, where the next thing typed belongs', async () => {
    const { view } = await editing('a line')

    press('format-list')

    expect(view.hasFocus).toBe(true)
  })

  it('goes away when the pane shows something that is not a document, because it belongs to the editor', async () => {
    await editing('a line')
    given(() => {
      expect(root.querySelector<HTMLElement>('[data-part="controls"]')?.hidden).toBe(false)
    })

    await editing('a line', '/doc/photo.png')

    expect(root.querySelector<HTMLElement>('[data-part="controls"]')?.hidden).toBe(true)
  })

  it('carries the preview controls too, since they mean nothing without an editor open', async () => {
    await editing('a line')

    expect(root.querySelector('[data-part="preview-markup"]')?.closest('[data-part="controls"]')).not.toBeNull()
  })

  it('sits inside the pane, so a split gets one bar for each tab strip', async () => {
    await editing('a line')

    expect(root.querySelector('[data-part="controls"]')?.closest('.pane')).not.toBeNull()
  })
})

describe('the chords a reader already knows from other editors', () => {
  it('puts the bold mark around the caret, so the icon and Ctrl/Cmd + B agree', async () => {
    const { view } = await editing('a line')
    given(() => {
      caretAt(view, 2)
    })

    chord(view, 'b')

    expect(view.state.doc.toString()).toBe('a ****line')
  })

  it('marks italic with an underscore, so it nests inside bold rather than cancelling it', async () => {
    const { view } = await editing('a line')
    given(() => {
      caretAt(view, 2)
    })

    chord(view, 'i')

    expect(view.state.doc.toString()).toBe('a __line')
  })

  it('puts the code mark around the caret', async () => {
    const { view } = await editing('a line')
    given(() => {
      caretAt(view, 2)
    })

    chord(view, 'e')

    expect(view.state.doc.toString()).toBe('a ``line')
  })

  it('makes a link at the caret, leaving the label and the target to be typed', async () => {
    const { view } = await editing('a line')
    given(() => {
      caretAt(view, 2)
    })

    chord(view, 'k')

    expect(view.state.doc.toString()).toBe('a []()line')
  })

  it('leaves a control with no chord of its own to the pointer', async () => {
    const { view } = await editing('a line')
    given(() => {
      caretAt(view, 2)
    })

    chord(view, 'd')

    expect(view.state.doc.toString()).toBe('a line')
  })
})
