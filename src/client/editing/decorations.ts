'use sanity'

import { syntaxTree } from '@codemirror/language'
import { StateField, type Extension } from '@codemirror/state'
import type { EditorState, Range } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

import { SEQUENCE_START } from '../../shared/sequences.ts'
import { linkTargetsIn } from './link-targets.ts'
import { isSyntax, notProse } from './spelling.ts'
import { inputsChanged } from './recompute.ts'

const WHOLE_MATCH = 0
const WITHOUT_TRAILING_COLON = -1

const CALLOUT_MARKER = /(?<![A-Za-z0-9_])(?:TODO|FIXME|NOTE):/gv
const HEADING_NODE = /^(?:ATX|Setext)Heading(?<level>[1-6])$/v

const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode'])

const OPEN_HINT = 'Ctrl/Cmd+click to open'

interface CodeRange {
  from: number
  to: number
}

function headingDecoration(level: number): Decoration {
  return Decoration.line({ class: `cm-vixen-heading cm-vixen-heading-${String(level)}` })
}

function markerDecoration(keyword: string): Decoration {
  return Decoration.mark({ class: `cm-vixen-marker cm-vixen-marker-${keyword.toLowerCase()}` })
}

function linkDecoration(destination: string, target: string): Decoration {
  return Decoration.mark({
    class: 'cm-vixen-link',
    attributes: { title: `${OPEN_HINT} ${target}`, 'data-destination': destination },
  })
}

function headingLevelOf(nodeName: string): number | null {
  const level = HEADING_NODE.exec(nodeName)?.groups?.level

  return level === undefined ? null : Number(level)
}

function keywordOf(markerMatch: string): string {
  return markerMatch.slice(SEQUENCE_START, WITHOUT_TRAILING_COLON)
}

function inCode(position: number, code: readonly CodeRange[]): boolean {
  return code.some((range) => position >= range.from && position < range.to)
}

function decorateCallouts(text: string, code: readonly CodeRange[], ranges: Array<Range<Decoration>>): void {
  for (const marker of text.matchAll(CALLOUT_MARKER)) {
    if (inCode(marker.index, code)) continue

    const { [WHOLE_MATCH]: matched } = marker
    ranges.push(markerDecoration(keywordOf(matched)).range(marker.index, marker.index + matched.length))
  }
}

function decorateLinks(state: EditorState, text: string, ranges: Array<Range<Decoration>>): void {
  for (const { destination, from, to, target } of linkTargetsIn(state, text)) {
    ranges.push(linkDecoration(destination, target).range(from, to))
  }
}

function computeDecorations(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = []
  const code: CodeRange[] = []
  const syntax: CodeRange[] = []
  const text = state.doc.toString()

  syntaxTree(state).iterate({
    enter: (node) => {
      const level = headingLevelOf(node.name)
      if (level !== null) ranges.push(headingDecoration(level).range(state.doc.lineAt(node.from).from))

      if (CODE_NODES.has(node.name)) code.push({ from: node.from, to: node.to })
      if (!isSyntax(node.name) || inCode(node.from, syntax)) return

      syntax.push({ from: node.from, to: node.to })
      ranges.push(notProse.range(node.from, node.to))
    },
  })

  decorateCallouts(text, code, ranges)
  decorateLinks(state, text, ranges)

  return Decoration.set(ranges, true)
}

const vixenDecorationField = StateField.define<DecorationSet>({
  create: (state) => computeDecorations(state),
  update: (value, transaction) => (inputsChanged(transaction) ? computeDecorations(transaction.state) : value),
  provide: (field) => EditorView.decorations.from(field),
})

export const vixenDecorations: Extension = [vixenDecorationField]

export const TestOnly = { computeDecorations, vixenDecorationField }
