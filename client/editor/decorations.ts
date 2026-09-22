'use sanity'

import { StateField, type Extension } from '@codemirror/state'
import type { EditorState, Line, Range } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

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
  return match.split('#').length - 1
}

function keywordOf(markerMatch: string): string {
  return markerMatch.slice(0, -1)
}

interface FenceState {
  delimiterChar: string
  delimiterLength: number
  isOpen: boolean
}

const OUTSIDE_FENCE: FenceState = { delimiterChar: '', delimiterLength: 0, isOpen: false }

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
  const delimiter = match === null ? '' : match[0].trimStart()

  if (fence.isOpen) {
    if (match === null) return { fence, decorate: false }

    return {
      fence: closesFence(fence, delimiter, text, match[0].length) ? OUTSIDE_FENCE : fence,
      decorate: false,
    }
  }

  if (match === null) return { fence, decorate: true }

  return {
    fence: { delimiterChar: delimiter.charAt(0), delimiterLength: delimiter.length, isOpen: true },
    decorate: false,
  }
}

function decorateLine(line: Line, ranges: Array<Range<Decoration>>): void {
  const heading = ATX_HEADING.exec(line.text)
  if (heading !== null) {
    ranges.push(headingDecoration(headingLevelOf(heading[0])).range(line.from))
  }

  for (const marker of line.text.matchAll(CALLOUT_MARKER)) {
    const from = line.from + marker.index
    ranges.push(markerDecoration(keywordOf(marker[0])).range(from, from + marker[0].length))
  }
}

export function computeDecorations(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = []
  let fence = OUTSIDE_FENCE

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber)
    const step = stepFence(fence, line.text)
    fence = step.fence

    if (step.decorate) decorateLine(line, ranges)
  }

  return Decoration.set(ranges, true)
}

export const vixenDecorationField = StateField.define<DecorationSet>({
  create: (state) => computeDecorations(state),
  update: (value, transaction) => (transaction.docChanged ? computeDecorations(transaction.state) : value),
  provide: (field) => EditorView.decorations.from(field),
})

export const vixenDecorations: Extension = [vixenDecorationField]
