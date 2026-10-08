'use sanity'

import type { ChangeSpec, EditorState, TransactionSpec } from '@codemirror/state'

const DOCUMENT_START = 0
const NEXT_LINE = 1
const OPENING = '['
const CLOSING_LABEL = ']('
const EMPTY_TARGET = ')'

function textBefore(state: EditorState, at: number, width: number): string {
  return state.sliceDoc(Math.max(DOCUMENT_START, at - width), at)
}

function textAfter(state: EditorState, at: number, width: number): string {
  return state.sliceDoc(at, Math.min(state.doc.length, at + width))
}

function alreadyMarked(state: EditorState, from: number, to: number, marker: string): boolean {
  const { length: width } = marker
  if (textBefore(state, from, width) !== marker || textAfter(state, to, width) !== marker) return false

  return textBefore(state, from - width, width) !== marker && textAfter(state, to + width, width) !== marker
}

export function markedWith(state: EditorState, marker: string): TransactionSpec {
  const {
    selection: {
      main: { from, to },
    },
  } = state
  const { length: width } = marker

  if (alreadyMarked(state, from, to, marker)) {
    return {
      changes: [
        { from: from - width, to: from },
        { from: to, to: to + width },
      ],
      selection: { anchor: from - width, head: to - width },
    }
  }

  return {
    changes: [
      { from, insert: marker },
      { from: to, insert: marker },
    ],
    selection: { anchor: from + width, head: to + width },
  }
}

function linesTouched(state: EditorState): number[] {
  const {
    selection: {
      main: { from, to },
    },
  } = state
  const { number: first } = state.doc.lineAt(from)
  const { number: last } = state.doc.lineAt(to)
  const numbers: number[] = []

  for (let line = first; line <= last; line += NEXT_LINE) numbers.push(line)

  return numbers
}

export function prefixedWith(state: EditorState, prefix: string): TransactionSpec {
  const lines = linesTouched(state).map((number) => state.doc.line(number))
  const everyOne = lines.every((line) => line.text.startsWith(prefix))

  const changes: ChangeSpec[] = lines.map((line) =>
    everyOne ? { from: line.from, to: line.from + prefix.length } : { from: line.from, insert: prefix },
  )

  return { changes }
}

export function linkedAround(state: EditorState): TransactionSpec {
  const {
    selection: {
      main: { from, to },
    },
  } = state

  return {
    changes: [
      { from, insert: OPENING },
      { from: to, insert: `${CLOSING_LABEL}${EMPTY_TARGET}` },
    ],
    selection: { anchor: to + OPENING.length + CLOSING_LABEL.length },
  }
}
