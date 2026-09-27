'use sanity'

import { markdown } from '@codemirror/lang-markdown'
import { EditorState, type Extension } from '@codemirror/state'

import { vixenDecorations } from './decorations.ts'
import { vixenDarkSurface, vixenHighlighting } from './highlight.ts'

const START_OF_DOCUMENT = 0

interface CreateEditorStateOptions {
  doc?: string
  selection?: { anchor: number }
  extensions?: Extension[]
}

export function createEditorState(options: CreateEditorStateOptions = {}): EditorState {
  return EditorState.create({
    doc: options.doc ?? '',
    selection: options.selection ?? { anchor: START_OF_DOCUMENT },
    extensions: [markdown(), vixenDarkSurface, vixenHighlighting, vixenDecorations, ...(options.extensions ?? [])],
  })
}
