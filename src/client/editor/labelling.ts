'use sanity'

import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { STORE_ROOT } from '../../shared/store-path.ts'

import { holderOf, holderPath } from './holder.ts'

const NOTHING_OPEN = 'Document'

export const vixenEditorLabel: Extension = EditorView.contentAttributes.compute([holderPath], (state) => {
  const holder = holderOf(state)

  return { 'aria-label': holder === STORE_ROOT ? NOTHING_OPEN : holder }
})
