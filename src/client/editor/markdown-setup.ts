'use sanity'

import { markdown } from '@codemirror/lang-markdown'
import { EditorState, type Extension } from '@codemirror/state'

import { vixenDecorations } from './decorations.ts'
import { vixenHighlighting } from './highlight.ts'

interface CreateEditorStateOptions {
  doc?: string
  extensions?: Extension[]
}

export function createEditorState(options: CreateEditorStateOptions = {}): EditorState {
  return EditorState.create({
    doc: options.doc ?? '',
    extensions: [markdown(), vixenHighlighting, vixenDecorations, ...(options.extensions ?? [])],
  })
}
