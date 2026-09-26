'use sanity'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAutosave, TestOnly, type Autosave, type SaveState } from '../../src/client/editor/autosave.ts'
import { serially } from '../../src/shared/serially.ts'

const { CEILING_MS, IDLE_MS } = TestOnly

const ALMOST_A_WINDOW = IDLE_MS - 1
const EDITS_PAST_THE_CEILING = Math.ceil(CEILING_MS / ALMOST_A_WINDOW)
const EDITS_SHORT_OF_THE_CEILING = EDITS_PAST_THE_CEILING - 1
const A_FEW_EDITS = 3

interface Recorded {
  writes: string[]
  states: SaveState[]
}

function autosaveWith(save: (content: string) => Promise<void>): { autosave: Autosave; recorded: Recorded } {
  const recorded: Recorded = { writes: [], states: [] }
  const autosave = createAutosave({
    async save(content: string): Promise<void> {
      recorded.writes.push(content)
      await save(content)
    },
    report: (state) => {
      recorded.states.push(state)
    },
  })

  return { autosave, recorded }
}

async function typeWithoutPausing(autosave: Autosave, edits: number): Promise<void> {
  const drafts = Array.from({ length: edits }, (_, n) => `draft ${String(n)}`)

  await serially(drafts, async (draft) => {
    autosave.changed(draft)
    await vi.advanceTimersByTimeAsync(ALMOST_A_WINDOW)
  })
}

function accepting(): { autosave: Autosave; recorded: Recorded } {
  return autosaveWith(async () => {
    await Promise.resolve()
  })
}

function refusing(): { autosave: Autosave; recorded: Recorded } {
  return autosaveWith(async () => {
    await Promise.resolve()
    throw new Error('412')
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the idle window', () => {
  it('saves once the buffer has been still for the window', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('start')

    autosave.changed('start and more')
    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(recorded.writes).toStrictEqual(['start and more'])
  })

  it('does not save before the window elapses', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('start')

    autosave.changed('start and more')
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1)

    expect(recorded.writes).toStrictEqual([])
  })

  it('restarts on every edit, so a typist is never interrupted mid-thought', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('')

    await typeWithoutPausing(autosave, A_FEW_EDITS)

    expect(recorded.writes).toStrictEqual([])
  })

  it('saves the latest content, not the edit that started the window', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('')

    autosave.changed('one')
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1)
    autosave.changed('two')
    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(recorded.writes).toStrictEqual(['two'])
  })
})

describe('the ceiling', () => {
  it('saves during continuous editing, which the idle window alone never would', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('')

    await typeWithoutPausing(autosave, EDITS_PAST_THE_CEILING)

    expect(recorded.writes.length).toBeGreaterThan(0)
  })

  it('is not restarted by an edit, or continuous typing would never save', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('')

    await typeWithoutPausing(autosave, EDITS_SHORT_OF_THE_CEILING)

    expect(recorded.writes).toStrictEqual([])

    await vi.advanceTimersByTimeAsync(CEILING_MS - EDITS_SHORT_OF_THE_CEILING * ALMOST_A_WINDOW)

    expect(recorded.writes).toHaveLength(1)
  })

  it('starts afresh for the next dirty period rather than carrying over', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('')

    autosave.changed('first')
    await vi.advanceTimersByTimeAsync(IDLE_MS)
    autosave.changed('second')
    await vi.advanceTimersByTimeAsync(CEILING_MS - 1)

    expect(recorded.writes).toStrictEqual(['first', 'second'])
  })
})

describe('an empty buffer', () => {
  it('is never sent, because the store refuses it', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('something')

    autosave.changed('   ')
    await vi.advanceTimersByTimeAsync(CEILING_MS * 2)

    expect(recorded.writes).toStrictEqual([])
  })

  it('reads as empty rather than as a save that is pending', () => {
    const { autosave } = accepting()
    autosave.reset('something')

    autosave.changed('')

    expect(autosave.state()).toBe('empty')
  })

  it('suspends the countdown until there is something to save', () => {
    const { autosave } = accepting()
    autosave.reset('something')

    autosave.changed('')

    expect(autosave.dueAt()).toBeNull()
  })

  it('starts the window again once the buffer has content', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('something')

    autosave.changed('')
    await vi.advanceTimersByTimeAsync(IDLE_MS)
    autosave.changed('back again')
    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(recorded.writes).toStrictEqual(['back again'])
  })
})

describe('a refused save', () => {
  it('reports the failure rather than staying silent', async () => {
    const { autosave } = refusing()
    autosave.reset('start')

    autosave.changed('doomed')
    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(autosave.state()).toBe('failed')
  })

  it('does not retry the same content every window', async () => {
    const { autosave, recorded } = refusing()
    autosave.reset('start')

    autosave.changed('doomed')
    await vi.advanceTimersByTimeAsync(IDLE_MS * 5)

    expect(recorded.writes).toStrictEqual(['doomed'])
  })

  it('cancels the pending attempts, which would fail identically', async () => {
    const { autosave, recorded } = refusing()
    autosave.reset('start')

    autosave.changed('doomed')
    await vi.advanceTimersByTimeAsync(CEILING_MS * 2)

    expect(recorded.writes).toStrictEqual(['doomed'])
  })

  it('shows no countdown, because nothing is scheduled', async () => {
    const { autosave } = refusing()
    autosave.reset('start')

    autosave.changed('doomed')
    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(autosave.dueAt()).toBeNull()
  })

  it('tries again once the content changes, because that is a different save', async () => {
    const { autosave, recorded } = refusing()
    autosave.reset('start')

    autosave.changed('doomed')
    await vi.advanceTimersByTimeAsync(IDLE_MS)
    autosave.changed('doomed, edited')
    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(recorded.writes).toStrictEqual(['doomed', 'doomed, edited'])
  })

  it('leaves the buffer dirty, so nothing is mistaken for stored', async () => {
    const { autosave } = refusing()
    autosave.reset('start')

    autosave.changed('doomed')
    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(autosave.state()).not.toBe('clean')
  })
})

describe('one writer at a time', () => {
  it('never has two writes in flight, which would spend an etag twice', async () => {
    let inFlight = 0
    let overlapped = false
    const { autosave } = autosaveWith(async () => {
      inFlight += 1
      overlapped ||= inFlight > 1
      await Promise.resolve()
      inFlight -= 1
    })
    autosave.reset('')

    autosave.changed('one')
    const first = autosave.flush()
    autosave.changed('two')
    const second = autosave.flush()
    await Promise.all([first, second])

    expect(overlapped).toBe(false)
  })

  it('picks up a change that arrived mid-write rather than losing it', async () => {
    const writes: string[] = []
    const autosave = createAutosave({
      async save(content: string): Promise<void> {
        writes.push(content)
        if (content === 'one') autosave.changed('two')
        await Promise.resolve()
      },
    })
    autosave.reset('')

    autosave.changed('one')
    await autosave.flush()

    expect(writes).toStrictEqual(['one', 'two'])
  })
})

describe('moving to another document mid-write', () => {
  it('discards the result rather than recording it against the new document', async () => {
    const writes: string[] = []
    const autosave = createAutosave({
      async save(content: string): Promise<void> {
        writes.push(content)
        autosave.reset('a different document')
        await Promise.resolve()
      },
    })
    autosave.reset('start')

    autosave.changed('edited')
    await autosave.flush()

    expect({ writes, state: autosave.state() }).toStrictEqual({ writes: ['edited'], state: 'clean' })
  })
})

describe('flush', () => {
  it('writes immediately rather than waiting out the window', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('start')

    autosave.changed('now please')
    await autosave.flush()

    expect(recorded.writes).toStrictEqual(['now please'])
  })

  it('does nothing when there is nothing to save', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('start')

    await autosave.flush()

    expect(recorded.writes).toStrictEqual([])
  })

  it('does not send an empty buffer, just as the scheduler would not', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('start')

    autosave.changed('  ')
    await autosave.flush()

    expect(recorded.writes).toStrictEqual([])
  })
})

describe('what the indicator is told', () => {
  it('reads clean once a save lands', async () => {
    const { autosave } = accepting()
    autosave.reset('start')

    autosave.changed('edited')
    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(autosave.state()).toBe('clean')
  })

  it('reads pending while the window runs', () => {
    const { autosave } = accepting()
    autosave.reset('start')

    autosave.changed('edited')

    expect(autosave.state()).toBe('pending')
  })

  it('offers a deadline the indicator can count down to', () => {
    const { autosave } = accepting()
    autosave.reset('start')

    autosave.changed('edited')

    expect(autosave.dueAt()).toBe(Date.now() + IDLE_MS)
  })

  it('counts down to the ceiling once it is nearer than the window', async () => {
    const { autosave } = accepting()
    autosave.reset('')

    autosave.changed('first')
    await vi.advanceTimersByTimeAsync(CEILING_MS - IDLE_MS + 1)
    autosave.changed('second')

    expect(autosave.dueAt()).toBeLessThan(Date.now() + IDLE_MS)
  })

  it('reports every state change, so the indicator never has to poll', async () => {
    const { autosave, recorded } = accepting()
    autosave.reset('start')

    autosave.changed('edited')
    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(recorded.states).toContain('pending')
    expect(recorded.states).toContain('saving')
    expect(recorded.states.at(-1)).toBe('clean')
  })

  it('returns to clean when an edit is undone back to what was stored', () => {
    const { autosave } = accepting()
    autosave.reset('start')

    autosave.changed('start and more')
    autosave.changed('start')

    expect(autosave.state()).toBe('clean')
  })
})
