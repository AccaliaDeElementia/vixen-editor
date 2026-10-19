'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createTabCaret } from '../../../src/client/document/tab-caret.ts'
import type { CaretMemory } from '../../../src/client/document/caret-memory.ts'

const TOP_OF_DOCUMENT = 0
const HOLDS_NOTHING = null

interface Remembered {
  opened: Array<{ entryPath: string; position: number }>
  moved: Array<{ entryPath: string; position: number }>
  settles: number
}

let remembered: Remembered = { opened: [], moved: [], settles: 0 }
let announced: number[] = []

function memory(): CaretMemory {
  return {
    opened: (entryPath, position) => {
      remembered.opened.push({ entryPath, position })
    },
    moved: (entryPath, position) => {
      remembered.moved.push({ entryPath, position })
    },
    settle: () => {
      remembered.settles += 1
    },
  }
}

function caretOf(holding: string | null = 'notes.md'): ReturnType<typeof createTabCaret> {
  return createTabCaret({
    memory: memory(),
    holding: () => holding,
    onMoved: (position: number) => {
      announced.push(position)
    },
  })
}

beforeEach(() => {
  remembered = { opened: [], moved: [], settles: 0 }
  announced = []
})

describe('where the caret is', () => {
  it('starts at the top, because nothing has placed it yet', () => {
    expect(caretOf().at()).toBe(TOP_OF_DOCUMENT)
  })

  it('is where it was last moved to', () => {
    const caret = caretOf()
    caret.moved(42)

    expect(caret.at()).toBe(42)
  })

  it('is where the document was opened at', () => {
    const caret = caretOf()
    caret.opened('notes.md', 17)

    expect(caret.at()).toBe(17)
  })
})

describe('a caret that moved', () => {
  it('is announced, so the pane can follow it', () => {
    caretOf().moved(42)

    expect(announced).toStrictEqual([42])
  })

  it('is remembered against the document holding it', () => {
    caretOf().moved(42)

    expect(remembered.moved).toStrictEqual([{ entryPath: 'notes.md', position: 42 }])
  })

  it('is remembered against nothing when the tab holds no document', () => {
    caretOf(HOLDS_NOTHING).moved(42)

    expect(remembered.moved).toStrictEqual([])
  })

  it('is still announced when the tab holds no document, because the pane asked to hear it', () => {
    caretOf(HOLDS_NOTHING).moved(42)

    expect(announced).toStrictEqual([42])
  })
})

describe('a document opened in the tab', () => {
  it('remembers where its caret started', () => {
    caretOf().opened('other.md', 9)

    expect(remembered.opened).toStrictEqual([{ entryPath: 'other.md', position: 9 }])
  })
})

describe('a buffer that shrank underneath the caret', () => {
  it('clamps the caret to what is left, so it cannot point past the end', () => {
    const caret = caretOf()
    caret.moved(42)

    expect(caret.clampTo(10)).toBe(10)
  })

  it('leaves a caret that still fits where it is', () => {
    const caret = caretOf()
    caret.moved(4)

    expect(caret.clampTo(10)).toBe(4)
  })

  it('keeps the clamped position, so a later read agrees with what it answered', () => {
    const caret = caretOf()
    caret.moved(42)
    caret.clampTo(10)

    expect(caret.at()).toBe(10)
  })
})

describe('settling the caret', () => {
  it('remembers where it was before settling, so the last move is not lost', () => {
    const caret = caretOf()
    caret.moved(42)
    remembered.moved = []

    caret.settle()

    expect(remembered.moved).toStrictEqual([{ entryPath: 'notes.md', position: 42 }])
  })

  it('tells the memory to settle, which is what writes it down', () => {
    caretOf().settle()

    expect(remembered.settles).toBe(1)
  })
})
