'use sanity'

import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

import { directoryOf, isStorePath, resolveDestination } from '../../shared/link-paths.ts'
import { destinationsIn } from '../../shared/markdown-tree.ts'

import { holderOf } from './holder.ts'

interface LinkTarget {
  from: number
  to: number
  markupFrom: number
  markupTo: number
  destination: string
  target: string
  isImage: boolean
}

export function linkTargetsIn(state: EditorState, text: string): LinkTarget[] {
  const directory = directoryOf(holderOf(state))
  const found: LinkTarget[] = []

  for (const { value, from, to, markupFrom, markupTo, isImage } of destinationsIn(syntaxTree(state), text)) {
    if (!isStorePath(value)) continue

    const target = resolveDestination(directory, value)
    if (target === null) continue

    found.push({ from, to, markupFrom, markupTo, destination: value, target, isImage })
  }

  return found
}

function widthOf(link: LinkTarget): number {
  return link.markupTo - link.markupFrom
}

export function linkTargetAt(state: EditorState, position: number): LinkTarget | null {
  const covering = linkTargetsIn(state, state.doc.toString()).filter(
    (link) => position >= link.markupFrom && position <= link.markupTo,
  )

  return covering.reduce<LinkTarget | null>(
    (widest, link) => (widest === null || widthOf(link) > widthOf(widest) ? link : widest),
    null,
  )
}
