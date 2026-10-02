'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { openDocumentIn } from '../../../src/client/navigation.ts'

function root(): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)

  return container
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('who holds the open document', () => {
  it('reads it from the address on first ask', () => {
    expect(openDocumentIn(root(), '/doc/journal/a.md').path()).toBe('journal/a.md')
  })

  it('resolves a folder url to its index, the way the loader does', () => {
    expect(openDocumentIn(root(), '/doc/journal/').path()).toBe('journal/index.md')
  })

  it('hands the same owner to everyone sharing a root, so no one keeps a copy', () => {
    const shared = root()

    expect(openDocumentIn(shared, '/doc/a.md')).toBe(openDocumentIn(shared, '/doc/b.md'))
  })

  it('ignores a later address, because the first ask is what established the document', () => {
    const shared = root()
    openDocumentIn(shared, '/doc/a.md')

    expect(openDocumentIn(shared, '/doc/b.md').path()).toBe('a.md')
  })

  it('keeps separate roots separate, so one page cannot answer for another', () => {
    expect(openDocumentIn(root(), '/doc/a.md').path()).not.toBe(openDocumentIn(root(), '/doc/b.md').path())
  })
})

describe('when the open document changes', () => {
  it('every reader sees it, rather than each keeping its own copy', () => {
    const shared = root()
    const reader = openDocumentIn(shared, '/doc/a.md')

    openDocumentIn(shared).commit('archive/a.md')

    expect(reader.path()).toBe('archive/a.md')
  })

  it('a reader that asked before the change still sees the change', () => {
    const shared = root()
    const before = openDocumentIn(shared, '/doc/a.md')
    const writer = openDocumentIn(shared)

    writer.commit('b.md')

    expect({ before: before.path(), writer: writer.path() }).toStrictEqual({ before: 'b.md', writer: 'b.md' })
  })
})
