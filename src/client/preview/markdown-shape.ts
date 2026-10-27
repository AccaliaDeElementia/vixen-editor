'use sanity'

import type { SyntaxNode } from '@lezer/common'

const LIST_MARK = 'ListMark'
const TABLE_CELL = 'TableCell'
const TABLE_DELIMITER = 'TableDelimiter'
const ITEM_MARKERS = new Set([LIST_MARK, 'TaskMarker'])

const BLANK_LINE = /\n[ \t]*\n/v
const PIPE = '|'
const COLON = ':'
const NOTHING_WRITTEN = ''

export const FIRST_NUMBER = 1
const NEXT = 1
const FIRST = 0
const PAST_FIRST = 1
const DECIMAL = 10

export type Alignment = 'left' | 'center' | 'right' | null

export function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = []
  const cursor = node.cursor()
  if (!cursor.firstChild()) return children

  do children.push(cursor.node)
  while (cursor.nextSibling())

  return children
}

export function childNamed(node: SyntaxNode, name: string): SyntaxNode | null {
  return childrenOf(node).find((child) => child.name === name) ?? null
}

function blocksIn(item: SyntaxNode): SyntaxNode[] {
  return childrenOf(item).filter((child) => !ITEM_MARKERS.has(child.name))
}

function anyBlankLineBetween(nodes: readonly SyntaxNode[], source: string): boolean {
  return nodes.some((node, index) => {
    const next = nodes.at(index + NEXT)

    return next !== undefined && BLANK_LINE.test(source.slice(node.to, next.from))
  })
}

export function isLoose(list: SyntaxNode, source: string): boolean {
  const items = childrenOf(list)

  return anyBlankLineBetween(items, source) || items.some((item) => anyBlankLineBetween(blocksIn(item), source))
}

export function startOf(list: SyntaxNode, source: string): number {
  const marks = childrenOf(list)
    .slice(FIRST, PAST_FIRST)
    .flatMap((item) => childrenOf(item).filter((child) => child.name === LIST_MARK))

  return marks.reduce(
    (_unused: number, mark) => Number.parseInt(source.slice(mark.from, mark.to), DECIMAL),
    FIRST_NUMBER,
  )
}

export function cellsOf(row: SyntaxNode): SyntaxNode[] {
  return childrenOf(row).filter((child) => child.name === TABLE_CELL)
}

function alignmentOf(cell: string): Alignment {
  const opensWithColon = cell.startsWith(COLON)
  const closesWithColon = cell.endsWith(COLON)
  if (opensWithColon && closesWithColon) return 'center'
  if (closesWithColon) return 'right'
  if (opensWithColon) return 'left'

  return null
}

export function alignmentsOf(table: SyntaxNode, source: string): readonly Alignment[] {
  const rows = childrenOf(table).filter((child) => child.name === TABLE_DELIMITER)

  return rows.slice(FIRST, PAST_FIRST).flatMap((row) =>
    source
      .slice(row.from, row.to)
      .split(PIPE)
      .map((cell) => cell.trim())
      .filter((cell) => cell !== NOTHING_WRITTEN)
      .map(alignmentOf),
  )
}
