'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { given } from '../../conditions.ts'
import { parseTrashEntry, type TrashEntryNode } from '../../../src/client/files/trash-entry.ts'
import { renderRestoreTree, TestOnly } from '../../../src/client/layout/restore-tree.ts'

function entryOf(children: unknown[]): TrashEntryNode {
  const parsed = parseTrashEntry({
    entry: { name: 'journal', path: '', kind: 'folder', restorable: true, blockedBy: null, children },
  })
  if (parsed === null) throw new Error('the fixture does not parse')

  return parsed
}

function file(name: string, extra: Record<string, unknown> = {}): unknown {
  return { name, path: name, kind: 'document', restorable: true, blockedBy: null, children: [], ...extra }
}

let into: HTMLElement = document.createElement('div')

beforeEach(() => {
  document.body.innerHTML = ''
  into = document.createElement('div')
  document.body.append(into)
})

function rows(): HTMLElement[] {
  return [...into.querySelectorAll<HTMLElement>(TestOnly.RESTORE_ROW_SELECTOR)]
}

describe('showing what a trashed entry holds', () => {
  it('puts the entry itself at the top', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })

    expect(rows().at(0)?.dataset.path).toBe('')
  })

  it('lists what is inside it below', () => {
    renderRestoreTree(into, entryOf([file('a.md'), file('b.md')]), {
      onChanged: () => undefined,
      onRename: () => undefined,
    })

    expect(rows().map((row) => row.dataset.path)).toStrictEqual(['', 'a.md', 'b.md'])
  })

  it('nests a folder’s contents inside it', () => {
    renderRestoreTree(
      into,
      entryOf([
        {
          name: '2026',
          path: '2026',
          kind: 'folder',
          restorable: true,
          blockedBy: null,
          children: [file('march.md', { path: '2026/march.md' })],
        },
      ]),
      { onChanged: () => undefined, onRename: () => undefined },
    )

    expect(rows().map((row) => row.dataset.path)).toStrictEqual(['', '2026', '2026/march.md'])
  })

  it('reads as a tree to anything that cannot see it', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })

    expect(into.querySelector('[role="tree"]')).not.toBeNull()
  })

  it('marks a folder as open, since nothing is hidden yet', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })

    expect(rows().at(0)?.getAttribute('aria-expanded')).toBe('true')
  })

  it('leaves a file without an expanded state, because it has nothing to open', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })

    expect(rows().at(1)?.hasAttribute('aria-expanded')).toBe(false)
  })

  it('indents by the label rather than by the row', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })

    expect(rows().at(1)?.querySelector<HTMLElement>('.restore-tree__label')?.style.paddingInlineStart).not.toBe('')
  })

  it('replaces what was shown before, rather than stacking entries', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })
    renderRestoreTree(into, entryOf([file('b.md')]), { onChanged: () => undefined, onRename: () => undefined })

    expect(rows().map((row) => row.dataset.path)).toStrictEqual(['', 'b.md'])
  })
})

describe('an item that cannot simply be put back', () => {
  it('says what is in the way', () => {
    renderRestoreTree(into, entryOf([file('a.md', { blockedBy: 'journal/a.md' })]), {
      onChanged: () => undefined,
      onRename: () => undefined,
    })

    expect(rows().at(1)?.textContent).toContain('journal/a.md is back')
  })

  it('says so when the name itself is the problem', () => {
    renderRestoreTree(into, entryOf([file(' odd.md', { path: ' odd.md', restorable: false })]), {
      onChanged: () => undefined,
      onRename: () => undefined,
    })

    expect(rows().at(1)?.textContent).toContain('name no longer allowed')
  })

  it('says nothing for one that is simply fine', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })

    expect(rows().at(1)?.querySelector('.restore-tree__blocked')).toBeNull()
  })
})

describe('choosing what to put back', () => {
  function nested(): TrashEntryNode {
    return entryOf([
      {
        name: '2026',
        path: '2026',
        kind: 'folder',
        restorable: true,
        blockedBy: null,
        children: [file('march.md', { path: '2026/march.md' }), file('april.md', { path: '2026/april.md' })],
      },
      file('notes.md'),
    ])
  }

  function occupied(): TrashEntryNode {
    const parsed = parseTrashEntry({
      entry: {
        name: 'journal',
        path: '',
        kind: 'folder',
        restorable: true,
        blockedBy: 'journal',
        children: [file('a.md', { blockedBy: 'journal/a.md' }), file('b.md')],
      },
    })
    if (parsed === null) throw new Error('the fixture does not parse')

    return parsed
  }

  function rowAt(path: string): HTMLElement {
    const row = rows().find((candidate) => candidate.dataset.path === path)
    if (row === undefined) throw new Error(`no row for ${path}`)

    return row
  }

  it('starts with the whole entry chosen, so putting it all back is one click', () => {
    renderRestoreTree(into, nested(), { onChanged: () => undefined, onRename: () => undefined })

    expect(rowAt('').getAttribute('aria-checked')).toBe('true')
  })

  it('shows what is inside the entry as chosen along with it', () => {
    renderRestoreTree(into, nested(), { onChanged: () => undefined, onRename: () => undefined })

    expect(rowAt('2026/march.md').getAttribute('aria-checked')).toBe('true')
  })

  it('drops the row that was clicked', () => {
    renderRestoreTree(into, nested(), { onChanged: () => undefined, onRename: () => undefined })

    rowAt('notes.md').click()

    expect(rowAt('notes.md').getAttribute('aria-checked')).toBe('false')
  })

  it('shows a folder as partly chosen once something under it is dropped', () => {
    renderRestoreTree(into, nested(), { onChanged: () => undefined, onRename: () => undefined })

    rowAt('2026/march.md').click()

    expect(rowAt('2026').getAttribute('aria-checked')).toBe('mixed')
  })

  it('reports the fewest roots that cover the choice, so one move restores a folder', () => {
    const tree = renderRestoreTree(into, nested(), { onChanged: () => undefined, onRename: () => undefined })

    rowAt('notes.md').click()

    expect(tree.roots()).toStrictEqual(['2026'])
  })

  it('takes a row back when it is clicked again', () => {
    const tree = renderRestoreTree(into, nested(), { onChanged: () => undefined, onRename: () => undefined })
    rowAt('notes.md').click()

    rowAt('notes.md').click()

    expect(tree.roots()).toStrictEqual(['2026', 'notes.md'])
  })

  it('chooses nothing when the entry cannot go back where it came from', () => {
    const tree = renderRestoreTree(into, occupied(), { onChanged: () => undefined, onRename: () => undefined })

    expect(tree.roots()).toStrictEqual([])
  })

  it('still offers the parts of a blocked entry that are free', () => {
    const tree = renderRestoreTree(into, occupied(), { onChanged: () => undefined, onRename: () => undefined })

    rowAt('b.md').click()

    expect(tree.roots()).toStrictEqual(['b.md'])
  })

  it('refuses a row whose place has been taken', () => {
    renderRestoreTree(into, occupied(), { onChanged: () => undefined, onRename: () => undefined })

    rowAt('a.md').click()

    expect(rowAt('a.md').getAttribute('aria-checked')).toBe('false')
  })

  it('tells the caller when the choice changes, so it can offer the restore', () => {
    const changes: number[] = []
    const tree = renderRestoreTree(into, nested(), {
      onChanged: () => {
        changes.push(tree.roots().length)
      },
      onRename: () => undefined,
    })

    rowAt('notes.md').click()

    expect(changes).toStrictEqual([1])
  })

  it('says it takes more than one, so a reader knows ticking is allowed', () => {
    renderRestoreTree(into, nested(), { onChanged: () => undefined, onRename: () => undefined })

    expect(into.querySelector('[role="tree"]')?.getAttribute('aria-multiselectable')).toBe('true')
  })
})

describe('reaching the rows from the keyboard', () => {
  function rowAt(index: number): HTMLElement {
    const row = rows().at(index)
    if (row === undefined) throw new Error(`no row at ${String(index)}`)

    return row
  }

  function press(row: HTMLElement, key: string): void {
    row.focus()
    row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  }

  it('offers one stop on the way in', () => {
    renderRestoreTree(into, entryOf([file('a.md'), file('b.md')]), {
      onChanged: () => undefined,
      onRename: () => undefined,
    })

    expect(rows().map((row) => row.tabIndex)).toStrictEqual([0, -1, -1])
  })

  it('turns the focused row over when space is pressed', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })

    press(rowAt(1), ' ')

    expect(rowAt(1).getAttribute('aria-checked')).toBe('false')
  })

  it('moves down the tree on the down arrow', () => {
    renderRestoreTree(into, entryOf([file('a.md'), file('b.md')]), {
      onChanged: () => undefined,
      onRename: () => undefined,
    })

    press(rowAt(1), 'ArrowDown')

    expect(document.activeElement).toBe(rowAt(2))
  })

  it('moves back up on the up arrow', () => {
    renderRestoreTree(into, entryOf([file('a.md'), file('b.md')]), {
      onChanged: () => undefined,
      onRename: () => undefined,
    })

    press(rowAt(2), 'ArrowUp')

    expect(document.activeElement).toBe(rowAt(1))
  })

  it('stays put at the bottom rather than wrapping around', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })

    press(rowAt(1), 'ArrowDown')

    expect(document.activeElement).toBe(rowAt(1))
  })

  it('stays put at the top rather than wrapping around', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })

    press(rowAt(0), 'ArrowUp')

    expect(document.activeElement).toBe(rowAt(0))
  })

  it('carries the one stop along with the focus', () => {
    renderRestoreTree(into, entryOf([file('a.md'), file('b.md')]), {
      onChanged: () => undefined,
      onRename: () => undefined,
    })

    press(rowAt(0), 'ArrowDown')

    expect(rows().map((row) => row.tabIndex)).toStrictEqual([-1, 0, -1])
  })

  it('leaves a key it has no use for to the page', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), { onChanged: () => undefined, onRename: () => undefined })

    press(rowAt(0), 'End')

    expect(rowAt(0).getAttribute('aria-checked')).toBe('true')
  })
})

describe('putting one item back somewhere else', () => {
  const INERT = { onChanged: () => undefined, onRename: () => undefined }

  function renameIn(root: ParentNode, path: string): HTMLButtonElement {
    const action = root.querySelector<HTMLButtonElement>(`[data-path="${path}"] .restore-tree__rename`)
    if (action === null) throw new Error(`no rename action for ${path}`)

    return action
  }

  it('offers the way out on every row, not only on a troubled one', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), INERT)

    expect(into.querySelectorAll('.restore-tree__rename')).toHaveLength(2)
  })

  it('asks the caller to place the row it sits on', () => {
    const asked: string[] = []
    renderRestoreTree(into, entryOf([file('a.md')]), {
      ...INERT,
      onRename: (path: string) => {
        asked.push(path)
      },
    })

    renameIn(into, 'a.md').click()

    expect(asked).toStrictEqual(['a.md'])
  })

  it('leaves the choice alone, so reaching for it costs nothing', () => {
    const tree = renderRestoreTree(into, entryOf([file('a.md'), file('b.md')]), INERT)
    given(() => {
      expect(tree.roots()).toStrictEqual([''])
    })

    renameIn(into, 'a.md').click()

    expect(tree.roots()).toStrictEqual([''])
  })

  it('reaches it from the row with the right arrow', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), INERT)
    const row = rows().at(1)
    row?.focus()

    row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))

    expect(document.activeElement).toBe(renameIn(into, 'a.md'))
  })

  it('goes back to the row with the left arrow', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), INERT)
    const action = renameIn(into, 'a.md')
    action.focus()

    action.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))

    expect(document.activeElement).toBe(rows().at(1))
  })

  it('leaves a key it has no use for where the focus already is', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), INERT)
    const action = renameIn(into, 'a.md')
    action.focus()

    action.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))

    expect(document.activeElement).toBe(action)
  })

  it('keeps the row out of the tab order, so a long tree is not a long tab run', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), INERT)

    expect(renameIn(into, 'a.md').tabIndex).toBe(-1)
  })

  it('names the row for a reader, rather than letting its buttons speak for it', () => {
    renderRestoreTree(into, entryOf([file('a.md', { blockedBy: 'journal/a.md' })]), INERT)

    expect(rows().at(1)?.getAttribute('aria-label')).toBe('a.md, journal/a.md is back')
  })

  it('names a row with nothing wrong by itself', () => {
    renderRestoreTree(into, entryOf([file('a.md')]), INERT)

    expect(rows().at(1)?.getAttribute('aria-label')).toBe('a.md')
  })
})
