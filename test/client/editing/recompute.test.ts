'use sanity'

import { describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { forceParsing } from '@codemirror/language'
import type { Extension, Transaction } from '@codemirror/state'

import { inputsChanged } from '../../../src/client/editing/recompute.ts'
import { createHolderControl } from '../../../src/client/editing/holder.ts'
import { createEditorState } from '../../../src/client/editing/markdown-setup.ts'

import { trackView } from '../editor-fixtures.ts'

const SHORT = '# a\n\n[link](a.md)\n'
const LINES_PAST_THE_FIRST_PARSE = 400
const PARSE_BUDGET_MS = 5_000
const A_CARET_POSITION = 2

interface Watched {
  view: EditorView
  transactions: Transaction[]
}

function watched(doc: string, extensions: Extension[] = []): Watched {
  const transactions: Transaction[] = []
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = trackView(
    new EditorView({
      parent,
      state: createEditorState({
        doc,
        extensions: [
          ...extensions,
          EditorView.updateListener.of((update) => {
            transactions.push(...update.transactions)
          }),
        ],
      }),
    }),
  )

  return { view, transactions }
}

function onlyTransaction({ transactions }: Watched): Transaction {
  const [first, ...rest] = transactions
  if (first === undefined || rest.length > 0) throw new Error(`expected one, saw ${transactions.length}`)

  return first
}

describe('whether the decorations have to be worked out again', () => {
  it('is no when the reader only moved the caret', () => {
    const watching = watched(SHORT)
    watching.view.dispatch({ selection: { anchor: A_CARET_POSITION } })

    expect(inputsChanged(onlyTransaction(watching))).toBe(false)
  })

  it('is yes when the text changed', () => {
    const watching = watched(SHORT)
    watching.view.dispatch({ changes: { from: 0, insert: 'x' } })

    expect(inputsChanged(onlyTransaction(watching))).toBe(true)
  })

  it('is yes when the buffer now holds a different document, because a relative link resolves differently', () => {
    const holder = createHolderControl()
    const watching = watched(SHORT, [holder.unset])
    holder.follow(watching.view, 'journal/2026/entry.md')

    expect(inputsChanged(onlyTransaction(watching))).toBe(true)
  })

  it('is yes when the parser reached further into a long document, even though nothing was typed', () => {
    const watching = watched('# h\n\n[a](a.md) text text text\n\n'.repeat(LINES_PAST_THE_FIRST_PARSE))

    forceParsing(watching.view, watching.view.state.doc.length, PARSE_BUDGET_MS)

    expect(inputsChanged(onlyTransaction(watching))).toBe(true)
  })

  it('leaves the document alone when the parser is what advanced', () => {
    const watching = watched('# h\n\n[a](a.md) text text text\n\n'.repeat(LINES_PAST_THE_FIRST_PARSE))

    forceParsing(watching.view, watching.view.state.doc.length, PARSE_BUDGET_MS)

    expect(onlyTransaction(watching).docChanged).toBe(false)
  })
})
