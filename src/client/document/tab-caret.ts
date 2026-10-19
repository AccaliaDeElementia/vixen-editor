'use sanity'

import type { CaretMemory } from './caret-memory.ts'

const TOP_OF_DOCUMENT = 0

interface TabCaretOptions {
  memory: CaretMemory
  holding: () => string | null
  onMoved: (position: number) => void
}

interface TabCaret {
  at: () => number
  moved: (position: number) => void
  opened: (entryPath: string, position: number) => void
  clampTo: (length: number) => number
  settle: () => void
}

export function createTabCaret({ memory, holding, onMoved }: TabCaretOptions): TabCaret {
  let position = TOP_OF_DOCUMENT

  function remember(): void {
    const entryPath = holding()
    if (entryPath === null) return

    memory.moved(entryPath, position)
  }

  return {
    at: () => position,

    moved: (to: number) => {
      position = to
      onMoved(position)
      remember()
    },

    opened: (entryPath: string, to: number) => {
      position = to
      memory.opened(entryPath, position)
    },

    clampTo: (length: number) => {
      position = Math.min(position, length)

      return position
    },

    settle: () => {
      remember()
      memory.settle()
    },
  }
}
