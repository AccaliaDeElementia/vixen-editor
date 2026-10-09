'use sanity'

import { rememberCaret } from './carets.ts'

const SETTLES_MS = 1000

interface CaretMemoryOptions {
  settlesMs?: number | undefined
  now?: (() => number) | undefined
}

interface Tracked {
  written: number | null
  wroteAt: number | null
  latest: number | null
}

export interface CaretMemory {
  opened: (entryPath: string, position: number) => void
  moved: (entryPath: string, position: number) => void
  settle: () => void
}

const UNTOUCHED: Tracked = { written: null, wroteAt: null, latest: null }

export function createCaretMemory(options: CaretMemoryOptions = {}): CaretMemory {
  const settlesMs = options.settlesMs ?? SETTLES_MS
  const now = options.now ?? Date.now
  const tracked = new Map<string, Tracked>()

  function trackedFor(entryPath: string): Tracked {
    return tracked.get(entryPath) ?? UNTOUCHED
  }

  function write(entryPath: string, position: number): void {
    const held = trackedFor(entryPath)
    if (position === held.written) return

    tracked.set(entryPath, { ...held, written: position, wroteAt: now() })
    rememberCaret(entryPath, position)
  }

  return {
    opened(entryPath: string, position: number): void {
      tracked.set(entryPath, { written: position, wroteAt: null, latest: null })
    },

    moved(entryPath: string, position: number): void {
      const held = trackedFor(entryPath)
      tracked.set(entryPath, { ...held, latest: position })
      if (held.wroteAt !== null && now() - held.wroteAt < settlesMs) return

      write(entryPath, position)
    },

    settle(): void {
      for (const [entryPath, held] of tracked) {
        if (held.latest !== null) write(entryPath, held.latest)
      }
    },
  }
}
