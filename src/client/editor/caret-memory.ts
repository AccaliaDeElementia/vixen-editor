'use sanity'

import { rememberCaret } from './carets.ts'

const SETTLES_MS = 1000

interface CaretMemoryOptions {
  settlesMs?: number | undefined
  now?: (() => number) | undefined
}

interface RestingCaret {
  path: string
  position: number
}

export interface CaretMemory {
  opened: (entryPath: string, position: number) => void
  moved: (entryPath: string, position: number) => void
  settle: () => void
}

function theSamePlace(one: RestingCaret | null, another: RestingCaret): boolean {
  return one !== null && one.path === another.path && one.position === another.position
}

export function createCaretMemory(options: CaretMemoryOptions = {}): CaretMemory {
  const settlesMs = options.settlesMs ?? SETTLES_MS
  const now = options.now ?? Date.now

  let latest: RestingCaret | null = null
  let written: RestingCaret | null = null
  let wroteAt: number | null = null

  function write(resting: RestingCaret): void {
    if (theSamePlace(written, resting)) return

    written = resting
    wroteAt = now()
    rememberCaret(resting.path, resting.position)
  }

  return {
    opened(entryPath: string, position: number): void {
      latest = null
      written = { path: entryPath, position }
      wroteAt = null
    },

    moved(entryPath: string, position: number): void {
      latest = { path: entryPath, position }
      if (wroteAt !== null && now() - wroteAt < settlesMs) return

      write(latest)
    },

    settle(): void {
      if (latest === null) return

      write(latest)
    },
  }
}
