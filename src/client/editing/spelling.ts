'use sanity'

import type { Extension } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'

const SYNTAX_NODES = new Set(['Autolink', 'CodeBlock', 'FencedCode', 'InlineCode', 'URL'])

export const vixenSpellcheck: Extension = EditorView.contentAttributes.of({ spellcheck: 'true' })

export const notProse: Decoration = Decoration.mark({ attributes: { spellcheck: 'false' } })

export function isSyntax(nodeName: string): boolean {
  return SYNTAX_NODES.has(nodeName)
}
