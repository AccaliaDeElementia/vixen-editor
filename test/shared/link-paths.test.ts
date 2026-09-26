'use sanity'

import { describe, expect, it } from 'vitest'

import { directoryOf, isStorePath, resolveDestination } from '../../src/shared/link-paths.ts'

describe('isStorePath', () => {
  it.each([
    ['a sibling document', 'notes.md'],
    ['an explicitly relative path', './image.png'],
    ['a parent path', '../journal/a.md'],
    ['a nested path', 'journal/2026/a.md'],
  ])('accepts %s', (_case, destination) => {
    expect(isStorePath(destination)).toBe(true)
  })

  it.each([
    ['an absolute url', 'https://example.test/a.md'],
    ['a scheme-only link', 'mailto:someone@example.test'],
    ['a site-absolute path, which names a route rather than a document', '/doc/a.md'],
    ['a protocol-relative url', '//example.test/a.md'],
    ['an empty destination', ''],
  ])('refuses %s', (_case, destination) => {
    expect(isStorePath(destination)).toBe(false)
  })

  it('refuses a scheme that merely looks like a path', () => {
    expect(isStorePath('data:text/plain,hello')).toBe(false)
  })
})

describe('directoryOf', () => {
  it.each([
    ['notes.md', ''],
    ['journal/a.md', 'journal'],
    ['journal/2026/a.md', 'journal/2026'],
  ])('reads the directory of %s as %j', (entryPath, expected) => {
    expect(directoryOf(entryPath)).toBe(expected)
  })
})

describe('resolveDestination', () => {
  it.each([
    ['journal', 'a.md', 'journal/a.md'],
    ['journal', './a.md', 'journal/a.md'],
    ['journal/2026', '../a.md', 'journal/a.md'],
    ['journal/2026', '../../a.md', 'a.md'],
    ['', 'a.md', 'a.md'],
    ['journal', 'nested/a.md', 'journal/nested/a.md'],
    ['journal', './/a.md', 'journal/a.md'],
  ])('resolves %j + %j to %j', (directory, destination, expected) => {
    expect(resolveDestination(directory, destination)).toBe(expected)
  })

  it('refuses to climb above the store root, which is not a place', () => {
    expect(resolveDestination('journal', '../../outside.md')).toBeNull()
  })

  it('refuses from the root too, where there is nothing above', () => {
    expect(resolveDestination('', '../outside.md')).toBeNull()
  })
})
