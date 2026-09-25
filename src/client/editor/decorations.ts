'use sanity'

import { StateField, type Extension } from '@codemirror/state'
import type { EditorState, Line, Range } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

import { SEQUENCE_START } from '../../shared/sequences.ts'

const NOT_HEADING_MARKER = /[^#]/gu
const WHOLE_MATCH = 0
const WITHOUT_TRAILING_COLON = -1
const NO_DELIMITER = 0
const CODEMIRROR_FIRST_LINE = 1
const NEXT_LINE = 1

const ATX_HEADING = /^ {0,3}#{1,6}(?: |$)/
const CODE_FENCE = /^ {0,3}(?:`{3,}|~{3,})/
const CALLOUT_MARKER = /(?<![A-Za-z0-9_])(?:TODO|FIXME|NOTE):/gu

function headingDecoration(level: number): Decoration {
  return Decoration.line({ class: `cm-vixen-heading cm-vixen-heading-${String(level)}` })
}

function markerDecoration(keyword: string): Decoration {
  return Decoration.mark({ class: `cm-vixen-marker cm-vixen-marker-${keyword.toLowerCase()}` })
}

function headingLevelOf(match: string): number {
  return match.replace(NOT_HEADING_MARKER, '').length
}

function keywordOf(markerMatch: string): string {
  return markerMatch.slice(SEQUENCE_START, WITHOUT_TRAILING_COLON)
}

interface FenceState {
  delimiterChar: string
  delimiterLength: number
  isOpen: boolean
}

const OUTSIDE_FENCE: FenceState = { delimiterChar: '', delimiterLength: NO_DELIMITER, isOpen: false }

interface FenceStep {
  fence: FenceState
  decorate: boolean
}

function closesFence(fence: FenceState, delimiter: string, text: string, matchLength: number): boolean {
  return (
    delimiter.startsWith(fence.delimiterChar) &&
    delimiter.length >= fence.delimiterLength &&
    text.slice(matchLength).trim() === ''
  )
}

function stepFence(fence: FenceState, text: string): FenceStep {
  const match = CODE_FENCE.exec(text)
  const delimiter = match === null ? '' : match[WHOLE_MATCH].trimStart()

  if (fence.isOpen) {
    if (match === null) return { fence, decorate: false }

    return {
      fence: closesFence(fence, delimiter, text, match[WHOLE_MATCH].length) ? OUTSIDE_FENCE : fence,
      decorate: false,
    }
  }

  if (match === null) return { fence, decorate: true }

  return {
    fence: { delimiterChar: delimiter.charAt(SEQUENCE_START), delimiterLength: delimiter.length, isOpen: true },
    decorate: false,
  }
}

function decorateLine(line: Line, ranges: Array<Range<Decoration>>): void {
  const heading = ATX_HEADING.exec(line.text)
  if (heading !== null) {
    ranges.push(headingDecoration(headingLevelOf(heading[WHOLE_MATCH])).range(line.from))
  }

  for (const marker of line.text.matchAll(CALLOUT_MARKER)) {
    const from = line.from + marker.index
    ranges.push(markerDecoration(keywordOf(marker[WHOLE_MATCH])).range(from, from + marker[WHOLE_MATCH].length))
  }
}

function computeDecorations(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = []
  let fence = OUTSIDE_FENCE

  for (let lineNumber = CODEMIRROR_FIRST_LINE; lineNumber <= state.doc.lines; lineNumber += NEXT_LINE) {
    const line = state.doc.line(lineNumber)
    const { fence: stepped, decorate } = stepFence(fence, line.text)
    fence = stepped

    if (decorate) decorateLine(line, ranges)
  }

  return Decoration.set(ranges, true)
}

const vixenDecorationField = StateField.define<DecorationSet>({
  create: (state) => computeDecorations(state),
  update: (value, transaction) => (transaction.docChanged ? computeDecorations(transaction.state) : value),
  provide: (field) => EditorView.decorations.from(field),
})

export const vixenDecorations: Extension = [vixenDecorationField]

export const TestOnly = { computeDecorations, vixenDecorationField }
