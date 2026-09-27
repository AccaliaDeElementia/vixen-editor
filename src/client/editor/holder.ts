'use sanity'

import { Compartment, Facet, type EditorState, type Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

import { SEQUENCE_START } from '../../shared/sequences.ts'
import { STORE_ROOT } from '../../shared/store-path.ts'

const holderPath = Facet.define<string, string>({
  combine: (paths) => paths.at(SEQUENCE_START) ?? STORE_ROOT,
})

interface HolderControl {
  unset: Extension
  follow: (view: EditorView, entryPath: string) => void
}

export function holderOf(state: EditorState): string {
  return state.facet(holderPath)
}

export function createHolderControl(): HolderControl {
  const carried = new Compartment()

  return {
    unset: carried.of([]),

    follow(view: EditorView, entryPath: string): void {
      view.dispatch({ effects: carried.reconfigure(holderPath.of(entryPath)) })
    },
  }
}
