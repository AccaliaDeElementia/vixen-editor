'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createTreeKeyboard } from '../../../../src/client/browser/tree/tree-keyboard.ts'
import { KEYS } from '../../../../src/client/platform/help.ts'
import type { VisibleRow } from '../../../../src/client/browser/tree/drawing.ts'
import { NOT_FOUND } from '../../../../src/shared/sequences.ts'

import { given } from '../../../conditions.ts'

const FOLDER = 'journal'
const CHILD = 'journal/entry.md'
const LOOSE = 'notes.md'

const PAST_THE_END = 9
const AT_THE_TOP = 0

function rowAt(shown: readonly VisibleRow[], index: number): VisibleRow {
  const { [index]: found } = shown
  if (found === undefined) throw new Error(`no row at ${index}`)

  return found
}

function folder(path: string): VisibleRow {
  return { path, expandable: true, kind: 'folder', opens: null }
}

function document_(path: string): VisibleRow {
  return { path, expandable: false, kind: 'document', opens: `/doc/${path}` }
}

const OPEN_TREE: readonly VisibleRow[] = [folder(FOLDER), document_(CHILD), document_(LOOSE)]
const SHUT_TREE: readonly VisibleRow[] = [folder(FOLDER), document_(LOOSE)]

let opened = new Set<string>()
let toggled: string[] = []
let selected: string[] = []
let visited: string[] = []
let rows: HTMLElement[] = []

function keyboard(shown: readonly VisibleRow[]): ReturnType<typeof createTreeKeyboard> {
  rows = shown.map(({ path }) => {
    const element = document.createElement('a')
    element.href = '#'
    element.dataset.path = path
    document.body.append(element)

    return element
  })

  return createTreeKeyboard({
    shown: () => shown,
    elements: () => rows,
    isOpen: (entryPath: string) => opened.has(entryPath),
    toggle: (entryPath: string) => {
      toggled.push(entryPath)
    },
    select: (entryPath: string) => {
      selected.push(entryPath)
    },
    navigate: (url: string) => {
      visited.push(url)
    },
  })
}

function focusedPath(): string | undefined {
  return document.activeElement instanceof HTMLElement ? document.activeElement.dataset.path : undefined
}

beforeEach(() => {
  document.body.innerHTML = ''
  opened = new Set()
  toggled = []
  selected = []
  visited = []
  rows = []
})

describe('finding a row among those on screen', () => {
  it('is where it sits in the order they are drawn', () => {
    expect(keyboard(OPEN_TREE).indexOfPath(LOOSE)).toBe(2)
  })

  it('is nowhere for a path inside a folder that is closed', () => {
    expect(keyboard(SHUT_TREE).indexOfPath(CHILD)).toBe(NOT_FOUND)
  })
})

describe('moving the focus to a row', () => {
  it('puts the focus on it', () => {
    keyboard(OPEN_TREE).focusAt(AT_THE_TOP)

    expect(focusedPath()).toBe(FOLDER)
  })

  it('makes it the selection, so the toolbar follows the keyboard', () => {
    keyboard(OPEN_TREE).focusAt(AT_THE_TOP)

    expect(selected).toStrictEqual([FOLDER])
  })

  it('says it moved', () => {
    expect(keyboard(OPEN_TREE).focusAt(AT_THE_TOP)).toBe(true)
  })

  it('says it did not when there is no row there', () => {
    expect(keyboard(OPEN_TREE).focusAt(PAST_THE_END)).toBe(false)
  })

  it('selects nothing when there is no row there', () => {
    keyboard(OPEN_TREE).focusAt(PAST_THE_END)

    expect(selected).toStrictEqual([])
  })
})

describe('walking up and down the tree', () => {
  it('goes to the row below', () => {
    keyboard(OPEN_TREE).handleKey(KEYS.nextRow, rowAt(OPEN_TREE, 0))

    expect(focusedPath()).toBe(CHILD)
  })

  it('goes to the row above', () => {
    keyboard(OPEN_TREE).handleKey(KEYS.previousRow, rowAt(OPEN_TREE, 1))

    expect(focusedPath()).toBe(FOLDER)
  })

  it('stays put at the bottom, so the focus does not leave the tree', () => {
    expect(keyboard(OPEN_TREE).handleKey(KEYS.nextRow, rowAt(OPEN_TREE, 2))).toBe(false)
  })

  it('stays put at the top', () => {
    expect(keyboard(OPEN_TREE).handleKey(KEYS.previousRow, rowAt(OPEN_TREE, 0))).toBe(false)
  })

  it('leaves a key it does not handle to the browser', () => {
    expect(keyboard(OPEN_TREE).handleKey('a', rowAt(OPEN_TREE, 0))).toBe(false)
  })
})

describe('opening a folder out', () => {
  it('opens one that is closed', () => {
    keyboard(SHUT_TREE).handleKey(KEYS.expandRow, rowAt(SHUT_TREE, 0))

    expect(toggled).toStrictEqual([FOLDER])
  })

  it('steps into one that is already open rather than opening it twice', () => {
    opened = new Set([FOLDER])

    keyboard(OPEN_TREE).handleKey(KEYS.expandRow, rowAt(OPEN_TREE, 0))

    expect(focusedPath()).toBe(CHILD)
  })

  it('does nothing on a document, which has nothing to open out', () => {
    expect(keyboard(OPEN_TREE).handleKey(KEYS.expandRow, rowAt(OPEN_TREE, 2))).toBe(false)
  })
})

describe('closing a folder up', () => {
  it('closes one that is open', () => {
    opened = new Set([FOLDER])

    keyboard(OPEN_TREE).handleKey(KEYS.collapseRow, rowAt(OPEN_TREE, 0))

    expect(toggled).toStrictEqual([FOLDER])
  })

  it('goes out to the folder holding it when the row is a document', () => {
    opened = new Set([FOLDER])

    keyboard(OPEN_TREE).handleKey(KEYS.collapseRow, rowAt(OPEN_TREE, 1))

    expect(focusedPath()).toBe(FOLDER)
  })

  it('goes out to the folder holding a closed folder rather than closing it again', () => {
    const nested: readonly VisibleRow[] = [folder(FOLDER), folder('journal/2026')]

    keyboard(nested).handleKey(KEYS.collapseRow, rowAt(nested, 1))

    expect(focusedPath()).toBe(FOLDER)
  })

  it('goes out from a document the stored open-folder set wrongly lists, rather than collapsing it', () => {
    opened = new Set([FOLDER, CHILD])

    keyboard(OPEN_TREE).handleKey(KEYS.collapseRow, rowAt(OPEN_TREE, 1))

    expect(toggled).toStrictEqual([])
  })

  it('stays put at the top level, where there is nothing to go out to', () => {
    expect(keyboard(OPEN_TREE).handleKey(KEYS.collapseRow, rowAt(OPEN_TREE, 2))).toBe(false)
  })
})

describe('opening what the focus is on', () => {
  it('follows the link of a document', () => {
    keyboard(OPEN_TREE).handleKey(KEYS.openRow, rowAt(OPEN_TREE, 2))

    expect(visited).toStrictEqual([`/doc/${LOOSE}`])
  })

  it('opens a folder out instead, since a folder has no page of its own', () => {
    keyboard(OPEN_TREE).handleKey(KEYS.openRow, rowAt(OPEN_TREE, 0))

    expect(toggled).toStrictEqual([FOLDER])
  })

  it('says no for a row that links nowhere', () => {
    expect(keyboard(OPEN_TREE).openRow(folder(FOLDER))).toBe(false)
  })

  it('navigates nowhere for a row that links nowhere', () => {
    const navigating = keyboard(OPEN_TREE)
    given(() => {
      expect(visited).toStrictEqual([])
    })

    navigating.openRow(folder(FOLDER))

    expect(visited).toStrictEqual([])
  })
})

describe('opening a folder on a double click', () => {
  it('goes to its index, which is what the trailing slash asks the server for', () => {
    keyboard(OPEN_TREE).openFolderIndex(folder(FOLDER))

    expect(visited).toStrictEqual([`/doc/${FOLDER}/`])
  })
})

describe('whether a key was handled, which is what stops the browser acting on it too', () => {
  it('is handled when the arrow opens a folder that was shut', () => {
    const keys = keyboard(SHUT_TREE)

    expect(keys.handleKey(KEYS.expandRow, folder(FOLDER))).toBe(true)
  })

  it('is handled when the arrow shuts a folder that was open', () => {
    opened = new Set([FOLDER])
    const keys = keyboard(OPEN_TREE)

    expect(keys.handleKey(KEYS.collapseRow, folder(FOLDER))).toBe(true)
  })

  it('is handled when the key opens a document', () => {
    const keys = keyboard(SHUT_TREE)

    expect(keys.handleKey(KEYS.openRow, document_(LOOSE))).toBe(true)
  })

  it('is handled when the key toggles a folder rather than opening it', () => {
    const keys = keyboard(SHUT_TREE)

    expect(keys.handleKey(KEYS.openRow, folder(FOLDER))).toBe(true)
  })
})
