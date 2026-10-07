'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createCaretMemory } from '../../../src/client/editor/caret-memory.ts'
import { TestOnly } from '../../../src/client/editor/carets.ts'

const A_SECOND = 1000
const MIDWAY = 400
const SOMEWHERE = 7
const FURTHER_ON = 19

let clock = 0

function remembering(): ReturnType<typeof createCaretMemory> {
  return createCaretMemory({ settlesMs: A_SECOND, now: () => clock })
}

function stored(): unknown {
  return JSON.parse(localStorage.getItem(TestOnly.CARETS_KEY) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  clock = 0
})

describe('a caret that has just moved', () => {
  it('is written at once, so a reader who only reads still leaves a mark', () => {
    remembering().moved('notes.md', SOMEWHERE)

    expect(stored()).toStrictEqual([{ path: 'notes.md', position: SOMEWHERE }])
  })

  it('is not written again while it is still moving, because the list is rewritten whole each time', () => {
    const memory = remembering()
    memory.moved('notes.md', SOMEWHERE)
    clock += MIDWAY

    memory.moved('notes.md', FURTHER_ON)

    expect(stored()).toStrictEqual([{ path: 'notes.md', position: SOMEWHERE }])
  })

  it('is written again once the throttle has run out', () => {
    const memory = remembering()
    memory.moved('notes.md', SOMEWHERE)
    clock += A_SECOND

    memory.moved('notes.md', FURTHER_ON)

    expect(stored()).toStrictEqual([{ path: 'notes.md', position: FURTHER_ON }])
  })

  it('is not written when it has not actually changed, so sitting still costs nothing', () => {
    const memory = remembering()
    memory.moved('notes.md', SOMEWHERE)
    localStorage.clear()
    clock += A_SECOND

    memory.moved('notes.md', SOMEWHERE)

    expect(stored()).toStrictEqual([])
  })
})

describe('a caret when the reader leaves what they were in', () => {
  it('is written where it ended up, not where the throttle last let it through', () => {
    const memory = remembering()
    memory.moved('notes.md', SOMEWHERE)
    memory.moved('notes.md', FURTHER_ON)

    memory.settle()

    expect(stored()).toStrictEqual([{ path: 'notes.md', position: FURTHER_ON }])
  })

  it('writes nothing when the caret never moved, so leaving a document untouched records nothing', () => {
    remembering().settle()

    expect(stored()).toStrictEqual([])
  })
})

describe('a caret in a document that has only just opened', () => {
  it('is not written, because opening somewhere is not moving there', () => {
    remembering().opened('notes.md', SOMEWHERE)

    expect(stored()).toStrictEqual([])
  })

  it('is not written when the reader puts it back where it started', () => {
    const memory = remembering()
    memory.opened('notes.md', SOMEWHERE)

    memory.moved('notes.md', SOMEWHERE)

    expect(stored()).toStrictEqual([])
  })

  it('is written as soon as the reader moves it somewhere else', () => {
    const memory = remembering()
    memory.opened('notes.md', SOMEWHERE)

    memory.moved('notes.md', FURTHER_ON)

    expect(stored()).toStrictEqual([{ path: 'notes.md', position: FURTHER_ON }])
  })

  it('is not written on leaving when the reader never moved it', () => {
    const memory = remembering()
    memory.opened('notes.md', SOMEWHERE)

    memory.settle()

    expect(stored()).toStrictEqual([])
  })
})
