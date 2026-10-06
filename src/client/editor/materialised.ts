'use sanity'

import type { EditorState } from '@codemirror/state'

const LOADED_EDITORS = 12
const OLDEST = 0
const NONE_TO_LET_GO = 0

interface Materialised {
  remember: (entryPath: string, state: EditorState) => void
  recall: (entryPath: string, content: string) => EditorState | null
}

export function createMaterialised(): Materialised {
  const loaded = new Map<string, EditorState>()

  function keepNewest(entryPath: string, state: EditorState): void {
    loaded.delete(entryPath)
    loaded.set(entryPath, state)

    const spare = Math.max(loaded.size - LOADED_EDITORS, NONE_TO_LET_GO)

    for (const stalest of [...loaded.keys()].slice(OLDEST, spare)) loaded.delete(stalest)
  }

  return {
    remember: keepNewest,

    recall(entryPath: string, content: string): EditorState | null {
      const state = loaded.get(entryPath)
      if (state?.doc.toString() !== content) return null

      keepNewest(entryPath, state)

      return state
    },
  }
}

export const TestOnly = { LOADED_EDITORS }
