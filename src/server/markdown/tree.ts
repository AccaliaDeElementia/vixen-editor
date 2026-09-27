'use sanity'

import type { Tree } from '@lezer/common'
import { parser, Strikethrough, Table, TaskList } from '@lezer/markdown'

import { decodeDestination } from '../../shared/link-syntax.ts'

const VIXEN_MARKDOWN_EXTENSIONS = [Table, TaskList, Strikethrough]

const markdownParser = parser.configure(VIXEN_MARKDOWN_EXTENSIONS)

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
  bracketed: boolean
  isImage: boolean
}

export function parseMarkdown(markdown: string): Tree {
  return markdownParser.parse(markdown)
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
        bracketed,
        isImage: holder.name === IMAGE_NODE,
      })
    },
  })

  return found
}
