'use sanity'

import { getChunks, unifiedMergeView } from '@codemirror/merge'
import { Compartment, type EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

const NOTHING_LEFT = 0

const reachableChunkButtons: Extension = EditorView.theme({
  '.cm-chunkButtons button': { minHeight: '24px', minWidth: '24px', padding: '0 0.5em' },
})

export interface MergeControl {
  inactive: Extension
  begin: (view: EditorView, onDisk: string) => void
  endWhenResolved: (view: EditorView) => void
}

function differencesLeft(state: EditorState): number | null {
  return getChunks(state)?.chunks.length ?? null
}

export function createMergeControl(onResolved: () => void): MergeControl {
  const overlay = new Compartment()

  return {
    inactive: overlay.of([]),

    begin(view: EditorView, onDisk: string): void {
      view.dispatch({
        effects: overlay.reconfigure([unifiedMergeView({ original: onDisk }), reachableChunkButtons]),
      })
    },

    endWhenResolved(view: EditorView): void {
      if (differencesLeft(view.state) !== NOTHING_LEFT) return

      view.dispatch({ effects: overlay.reconfigure([]) })
      onResolved()
    },
  }
}
