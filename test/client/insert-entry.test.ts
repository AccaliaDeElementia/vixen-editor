'use sanity'

import { describe, expect, it } from 'vitest'

import { onInsertRequested, requestInsert } from '../../src/client/insert-entry.ts'

function listening(): { root: HTMLElement; heard: string[] } {
  const root = document.createElement('div')
  document.body.append(root)
  const heard: string[] = []
  onInsertRequested(root, (entryPath) => {
    heard.push(entryPath)
  })

  return { root, heard }
}

describe('asking the editor to insert a tree entry', () => {
  it('carries the path to whoever is listening', () => {
    const { root, heard } = listening()

    requestInsert(root, 'journal/a.md')

    expect(heard).toStrictEqual(['journal/a.md'])
  })

  it('rises from a nested element, so the tree can ask without knowing the root', () => {
    const { root, heard } = listening()
    const tree = document.createElement('ul')
    root.append(tree)

    requestInsert(tree, 'journal/a.md')

    expect(heard).toStrictEqual(['journal/a.md'])
  })

  it('ignores an unrelated event of the same name', () => {
    const { root, heard } = listening()

    root.dispatchEvent(new Event('vixen:insert-entry', { bubbles: true }))

    expect(heard).toStrictEqual([])
  })
})
