'use sanity'

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const HEADING = 'var(--ink-heading)'
const MUTED = 'var(--muted)'
const RULE = 'var(--ink-primary)'
const LINK = 'var(--ink-info)'
const CODE = 'var(--ink-success)'
const KEYWORD = 'var(--ink-warning)'
const INVALID = 'var(--ink-danger)'

export const vixenHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: HEADING, fontWeight: '700' },
  { tag: tags.processingInstruction, color: MUTED },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: LINK, textDecoration: 'underline' },
  { tag: tags.url, color: LINK },
  { tag: tags.monospace, color: CODE },
  { tag: tags.quote, color: MUTED, fontStyle: 'italic' },
  { tag: tags.list, color: LINK },
  { tag: tags.contentSeparator, color: RULE },
  { tag: tags.keyword, color: KEYWORD },
  { tag: tags.tagName, color: LINK },
  { tag: tags.attributeName, color: KEYWORD },
  { tag: tags.string, color: CODE },
  { tag: tags.comment, color: MUTED, fontStyle: 'italic' },
  { tag: tags.punctuation, color: MUTED },
  { tag: tags.operator, color: MUTED },
  { tag: tags.invalid, color: INVALID },
])

export const vixenHighlighting: Extension = syntaxHighlighting(vixenHighlightStyle)

export const vixenDarkSurface: Extension = EditorView.theme({}, { dark: true })
