'use sanity'

import { undoDepth } from '@codemirror/commands'
import { highlightingFor } from '@codemirror/language'
import { lintKeymap } from '@codemirror/lint'
import { EditorSelection, type Extension } from '@codemirror/state'
import { tags } from '@lezer/highlight'
import { keymap, type KeyBinding } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { describe, expect, it } from 'vitest'

import { createEditorState } from '../../../src/client/editing/markdown-setup.ts'
import { vixenEditorSetup } from '../../../src/client/editing/editor-setup.ts'

const ONE_CHANGE = 1
const TWO_CURSORS = 2
const START_OF_DOCUMENT = 0

function spellingsOf(bindings: readonly KeyBinding[]): Set<string> {
  const found = new Set<string>()

  for (const binding of bindings) {
    for (const spelling of [binding.key, binding.mac, binding.win, binding.linux]) {
      if (typeof spelling === 'string') found.add(spelling)
    }
  }

  return found
}

function keysBoundBy(extensions: Extension[]): Set<string> {
  return spellingsOf(createEditorState({ extensions }).facet(keymap).flat())
}

const ours = keysBoundBy([vixenEditorSetup])
const bundled = keysBoundBy([basicSetup])
const linting = spellingsOf(lintKeymap)

describe('what the editor binds, against the convenience bundle it was written from', () => {
  it('keeps every key the bundle binds, apart from the lint keys nothing here can raise', () => {
    expect([...bundled].filter((key) => !ours.has(key) && !linting.has(key)).sort()).toStrictEqual([])
  })

  it('binds nothing the bundle does not, so the list has gained nothing unannounced', () => {
    expect([...ours].filter((key) => !bundled.has(key)).sort()).toStrictEqual([])
  })

  it('binds none of the lint keys, there being no linter in this app to answer them', () => {
    expect([...ours].filter((key) => linting.has(key)).sort()).toStrictEqual([])
  })

  it('names lint keys at all, so the comparison above is not against an empty set', () => {
    expect(linting.size).toBeGreaterThan(START_OF_DOCUMENT)
  })
})

describe('what the editor provides beyond its keys', () => {
  it('records an edit in the undo history, so a key bound to undo has something to take back', () => {
    const state = createEditorState({ doc: 'a', extensions: [vixenEditorSetup] })

    const { state: edited } = state.update({ changes: { from: START_OF_DOCUMENT, insert: 'b' } })

    expect(undoDepth(edited)).toBe(ONE_CHANGE)
  })

  it('holds more than one selection at once, which the multi-cursor keys are useless without', () => {
    const state = createEditorState({ doc: 'abcdef', extensions: [vixenEditorSetup] })

    const { state: selected } = state.update({
      selection: EditorSelection.create([EditorSelection.range(0, 1), EditorSelection.range(3, 4)]),
    })

    expect(selected.selection.ranges).toHaveLength(TWO_CURSORS)
  })

  it('leaves the highlighting to the project style, so the bundle default it drops was never consulted', () => {
    const withSetup = createEditorState({ extensions: [vixenEditorSetup] })

    expect(highlightingFor(withSetup, [tags.heading])).toBe(highlightingFor(createEditorState(), [tags.heading]))
  })
})
