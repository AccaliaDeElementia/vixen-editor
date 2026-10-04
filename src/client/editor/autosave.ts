'use sanity'

import { isBlank } from '../../shared/content.ts'

const IDLE_MS = 30_000
const CEILING_MS = 120_000

export type SaveState = 'clean' | 'pending' | 'saving' | 'empty' | 'failed'

export interface Autosave {
  changed: (content: string) => void
  reset: (content: string) => void
  flush: () => Promise<void>
  stop: () => void
  state: () => SaveState
  dueAt: () => number | null
}

interface AutosaveOptions {
  save: (content: string) => Promise<void>
  report?: (state: SaveState) => void
  idleMs?: number
  ceilingMs?: number
}

export function createAutosave(options: AutosaveOptions): Autosave {
  const idleMs = options.idleMs ?? IDLE_MS
  const ceilingMs = options.ceilingMs ?? CEILING_MS
  const report = options.report ?? ((): void => undefined)

  let saved = ''
  let current = ''
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let ceilingTimer: ReturnType<typeof setTimeout> | null = null
  let ceilingAt = 0
  let deadlines: { idle: number; ceiling: number } | null = null
  let writing = false
  let refused: string | null = null
  let inFlight: Promise<void> | null = null
  let tracking = {}
  let stopped = false

  function dirty(): boolean {
    return current !== saved
  }

  function nothingToWrite(): boolean {
    return !dirty() || isBlank(current)
  }

  function movedOnSince(era: object): boolean {
    return era !== tracking
  }

  function state(): SaveState {
    if (writing) return 'saving'
    if (!dirty()) return 'clean'
    if (isBlank(current)) return 'empty'

    return refused === current ? 'failed' : 'pending'
  }

  function announce(): void {
    report(state())
  }

  function stopIdle(): void {
    if (idleTimer !== null) clearTimeout(idleTimer)
    idleTimer = null
    deadlines = null
  }

  function stopCeiling(): void {
    if (ceilingTimer !== null) clearTimeout(ceilingTimer)
    ceilingTimer = null
  }

  async function drain(): Promise<void> {
    while (!nothingToWrite()) {
      const attempt = current
      const startedTracking = tracking
      writing = true
      announce()

      let rejected = false
      try {
        /* eslint-disable-next-line no-await-in-loop -- one write at a time is
           the point: the next attempt has to carry the etag the last one
           returned, so they cannot overlap */
        await options.save(attempt)
      } catch {
        rejected = true
      }

      writing = false
      if (movedOnSince(startedTracking)) return

      if (rejected) {
        refused = attempt
        stopIdle()
        stopCeiling()
        break
      }

      saved = attempt
      refused = null
    }

    announce()
  }

  async function write(): Promise<void> {
    inFlight ??= drain().finally(() => {
      inFlight = null
    })

    await inFlight
  }

  function schedule(): void {
    stopIdle()
    if (nothingToWrite() || refused === current) {
      stopCeiling()
      announce()
      return
    }

    const idle = Date.now() + idleMs
    idleTimer = setTimeout(() => {
      void write()
    }, idleMs)

    const ceilingAlreadyRunning = ceilingTimer !== null
    if (!ceilingAlreadyRunning) {
      ceilingAt = Date.now() + ceilingMs
      ceilingTimer = setTimeout(() => {
        void write()
      }, ceilingMs)
    }

    deadlines = { idle, ceiling: ceilingAt }
    announce()
  }

  return {
    changed(content: string): void {
      if (stopped) return

      current = content
      schedule()
    },

    reset(content: string): void {
      stopIdle()
      stopCeiling()
      tracking = {}
      saved = content
      current = content
      refused = null
      announce()
    },

    stop(): void {
      stopped = true
      stopIdle()
      stopCeiling()
    },

    async flush(): Promise<void> {
      if (nothingToWrite()) return

      refused = null
      await write()
    },

    state,

    dueAt: () => (deadlines === null ? null : Math.min(deadlines.idle, deadlines.ceiling)),
  }
}

export const TestOnly = { CEILING_MS, IDLE_MS }
