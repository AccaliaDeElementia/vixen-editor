'use sanity'

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { tags } from '@lezer/highlight'

const WHITE = '#ffffff'
const MUTED = '#adb5bd'
const PRIMARY = '#375a7f'
const INFO = '#3498db'
const SUCCESS = '#00bc8c'
const WARNING = '#f39c12'
const DANGER = '#e74c3c'

const vixenHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: WHITE, fontWeight: '700' },
  { tag: tags.processingInstruction, color: MUTED },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: INFO, textDecoration: 'underline' },
  { tag: tags.url, color: INFO },
  { tag: tags.monospace, color: SUCCESS },
  { tag: tags.quote, color: MUTED, fontStyle: 'italic' },
  { tag: tags.list, color: INFO },
  { tag: tags.contentSeparator, color: PRIMARY },
  { tag: tags.keyword, color: WARNING },
  { tag: tags.invalid, color: DANGER },
])

export const vixenHighlighting: Extension = syntaxHighlighting(vixenHighlightStyle)

export const TestOnly = { vixenHighlightStyle }
