'use sanity'

import { describe, expect, it } from 'vitest'

import { EditorState } from '@codemirror/state'

import { linkedAround, markedWith, prefixedWith } from '../../../src/client/editor/formatting.ts'

function at(doc: string): EditorState {
  const anchor = doc.indexOf('[')
  const head = doc.indexOf(']') - 1

  return EditorState.create({ doc: doc.replace('[', '').replace(']', ''), selection: { anchor, head } })
}

function marked(doc: string, marker: string): string {
  const state = at(doc)

  return state.update(markedWith(state, marker)).state.doc.toString()
}

function prefixed(doc: string, prefix: string): string {
  const state = at(doc)

  return state.update(prefixedWith(state, prefix)).state.doc.toString()
}

describe('putting a mark around the selection', () => {
  it('wraps what is selected', () => {
    expect(marked('a [word] here', '**')).toBe('a **word** here')
  })

  it('takes the mark off again when it is already there, so the button is its own undo', () => {
    expect(marked('a **[word]** here', '**')).toBe('a word here')
  })

  it('wraps an empty selection, so a reader can type between the marks', () => {
    expect(marked('a []here', '**')).toBe('a ****here')
  })

  it('leaves a longer run alone, so italic inside bold does not unbold it', () => {
    expect(marked('a __[word]__ here', '_')).toBe('a ___word___ here')
  })

  it('reads the same marker on both sides, rather than one being enough', () => {
    expect(marked('a **[word] here', '**')).toBe('a ****word** here')
  })
})

describe('putting a prefix on the lines the selection touches', () => {
  it('prefixes the line the caret is on', () => {
    expect(prefixed('a li[]ne', '- ')).toBe('- a line')
  })

  it('takes it off again when it is already there', () => {
    expect(prefixed('- a li[]ne', '- ')).toBe('a line')
  })

  it('prefixes every line a selection spans', () => {
    expect(prefixed('on[e\ntw]o', '> ')).toBe('> one\n> two')
  })

  it('takes it off every line only when every line has it', () => {
    expect(prefixed('> on[e\n> tw]o', '> ')).toBe('one\ntwo')
  })

  it('adds it to all of them when only some have it, so the lines end up alike', () => {
    expect(prefixed('> on[e\ntw]o', '> ')).toBe('> > one\n> two')
  })
})

describe('making a link out of the selection', () => {
  function linked(doc: string): { text: string; caret: number } {
    const state = at(doc)
    const { state: after } = state.update(linkedAround(state))

    return { text: after.doc.toString(), caret: after.selection.main.head }
  }

  it('wraps the selection as the label, leaving the target to be typed', () => {
    expect(linked('a [word] here').text).toBe('a [word]() here')
  })

  it('puts the caret where the target goes, so the reader can type it straight away', () => {
    expect(linked('a [word] here').caret).toBe('a [word]('.length)
  })
})
