'use sanity'

import type { SyntaxNode, SyntaxNodeRef, Tree } from '@lezer/common'
import { Autolink, Table, TaskList } from '@lezer/markdown'
import type { DelimiterType, InlineContext, MarkdownConfig } from '@lezer/markdown'
import { tags } from '@lezer/highlight'

import { decodeDestination } from './link-syntax.ts'

const STRIKETHROUGH = 'Strikethrough'
const STRIKETHROUGH_MARK = 'StrikethroughMark'

const TILDE = 126
const ONE_TILDE = 1
const TWO_TILDES = 2
const MORE_THAN_TWO_TILDES = 3
const NEXT_CHARACTER = 1
const NO_MATCH = -1

const PUNCTUATION = /[\p{S}\p{P}]/v
const WHITESPACE = /\s|^$/v

const delimitersByRunLength = new Map<number, DelimiterType>()

function delimiterForRunOf(length: number): DelimiterType {
  const known = delimitersByRunLength.get(length)
  if (known !== undefined) return known

  const made: DelimiterType = { resolve: STRIKETHROUGH, mark: STRIKETHROUGH_MARK }
  delimitersByRunLength.set(length, made)

  return made
}

function runOfTildesAt(cx: InlineContext, pos: number): number {
  if (cx.char(pos + NEXT_CHARACTER) !== TILDE) return ONE_TILDE
  if (cx.char(pos + TWO_TILDES) === TILDE) return MORE_THAN_TWO_TILDES

  return TWO_TILDES
}

function parseTildes(cx: InlineContext, next: number, pos: number): number {
  if (next !== TILDE) return NO_MATCH

  const run = runOfTildesAt(cx, pos)
  if (run > TWO_TILDES) return NO_MATCH

  const end = pos + run
  const before = cx.slice(pos - NEXT_CHARACTER, pos)
  const after = cx.slice(end, end + NEXT_CHARACTER)
  const spaceBefore = WHITESPACE.test(before)
  const spaceAfter = WHITESPACE.test(after)
  const punctuationBefore = PUNCTUATION.test(before)
  const punctuationAfter = PUNCTUATION.test(after)

  return cx.addDelimiter(
    delimiterForRunOf(run),
    pos,
    end,
    !spaceAfter && (!punctuationAfter || spaceBefore || punctuationBefore),
    !spaceBefore && (!punctuationBefore || spaceAfter || punctuationAfter),
  )
}

const VixenStrikethrough: MarkdownConfig = {
  defineNodes: [
    { name: STRIKETHROUGH, style: { 'Strikethrough/...': tags.strikethrough } },
    { name: STRIKETHROUGH_MARK, style: tags.processingInstruction },
  ],
  parseInline: [{ name: STRIKETHROUGH, parse: parseTildes, after: 'Emphasis' }],
}

export const VIXEN_MARKDOWN_EXTENSIONS = [Table, TaskList, VixenStrikethrough, Autolink]

const DESTINATION_NODE = 'URL'
const IMAGE_NODE = 'Image'
const LINKING_NODES = new Set(['Link', IMAGE_NODE, 'LinkReference'])

const ANGLE_OPEN = '<'
const ANGLE_CLOSE = '>'
const PAST_ANGLE = 1
const EMPTY_DESTINATION = 0

interface LinkDestination {
  value: string
  from: number
  to: number
  markupFrom: number
  markupTo: number
  bracketed: boolean
  isImage: boolean
}

function withoutAngles(text: string, from: number, to: number): { from: number; to: number; bracketed: boolean } {
  const bracketed = text.startsWith(ANGLE_OPEN) && text.endsWith(ANGLE_CLOSE)

  return bracketed ? { from: from + PAST_ANGLE, to: to - PAST_ANGLE, bracketed } : { from, to, bracketed }
}

export function destinationsIn(tree: Tree, markdown: string): LinkDestination[] {
  const found: LinkDestination[] = []

  tree.iterate({
    enter: (node) => {
      if (node.name !== DESTINATION_NODE) return

      const { node: subtree } = node
      const { parent: holder } = subtree
      if (holder === null || !LINKING_NODES.has(holder.name)) return

      const { from, to, bracketed } = withoutAngles(markdown.slice(node.from, node.to), node.from, node.to)
      if (to - from === EMPTY_DESTINATION) return

      found.push({
        value: decodeDestination(markdown.slice(from, to)),
        from,
        to,
        markupFrom: holder.from,
        markupTo: holder.to,
        bracketed,
        isImage: holder.name === IMAGE_NODE,
      })
    },
  })

  return found
}

const HEADING_NODE = /^(?:ATX|Setext)Heading(?<level>[1-6])$/v
const WHITESPACE_RUN = /\s+/gv

const MARK_SUFFIX = 'Mark'
const LABEL_NODE = 'LinkLabel'
const ESCAPE_NODE = 'Escape'

const NOT_A_HEADING = 0
const ESCAPED_CHARACTER = 1

interface Cut {
  from: number
  to: number
}

interface Heading {
  level: number
  text: string
  from: number
}

function levelOf(name: string): number {
  const level = HEADING_NODE.exec(name)?.groups?.level

  return level === undefined ? NOT_A_HEADING : Number(level)
}

function isLinkDestination(node: SyntaxNode): boolean {
  const { parent: holder } = node

  return holder !== null && LINKING_NODES.has(holder.name)
}

function cutFor(node: SyntaxNodeRef): Cut | null {
  if (node.name.endsWith(MARK_SUFFIX) || node.name === LABEL_NODE) return { from: node.from, to: node.to }
  if (node.name === ESCAPE_NODE) return { from: node.from, to: node.to - ESCAPED_CHARACTER }
  if (node.name === DESTINATION_NODE && isLinkDestination(node.node)) return { from: node.from, to: node.to }

  return null
}

function cutsIn(tree: Tree, heading: SyntaxNodeRef): Cut[] {
  const cuts: Cut[] = []

  tree.iterate({
    from: heading.from,
    to: heading.to,
    enter: (node) => {
      const cut = cutFor(node)
      if (cut !== null) cuts.push(cut)
    },
  })

  return cuts
}

function textOf(markdown: string, tree: Tree, heading: SyntaxNodeRef): string {
  const read = cutsIn(tree, heading).reduce(
    (taken, cut) => ({ text: taken.text + markdown.slice(taken.from, cut.from), from: cut.to }),
    { text: '', from: heading.from },
  )

  return `${read.text}${markdown.slice(read.from, heading.to)}`.replace(WHITESPACE_RUN, ' ').trim()
}

function headingsIn(tree: Tree, markdown: string): Heading[] {
  const found: Heading[] = []

  tree.iterate({
    enter: (node) => {
      const level = levelOf(node.name)
      if (level === NOT_A_HEADING) return

      found.push({ level, text: textOf(markdown, tree, node), from: node.from })
    },
  })

  return found
}

export const TestOnly = { headingsIn }
