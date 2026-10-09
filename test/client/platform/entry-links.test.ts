'use sanity'

import { describe, expect, it } from 'vitest'

import { linkFor, linkTo } from '../../../src/client/platform/entry-links.ts'

describe('the link a tree path becomes', () => {
  it('embeds an image, the same as dragging it', () => {
    expect(linkTo('journal/p.png', 'journal/notes.md')).toBe('![p.png](p.png)')
  })

  it('links a document, the same as dragging it', () => {
    expect(linkTo('journal/a.md', 'journal/notes.md')).toBe('[a.md](a.md)')
  })

  it('treats a path with no document or image extension as a folder', () => {
    expect(linkTo('journal/sub', 'journal/notes.md')).toBe('[sub](sub/)')
  })

  it('treats a folder whose name carries an extension as a folder too', () => {
    expect(linkTo('journal/v1.2', 'journal/notes.md')).toBe('[v1.2](v1.2/)')
  })
})

describe('the link a dragged entry becomes', () => {
  it('links a document by its name, relative to the document holding it', () => {
    expect(linkFor({ path: 'journal/a.md', kind: 'document' }, 'journal/notes.md')).toBe('[a.md](a.md)')
  })

  it('embeds an image rather than linking it', () => {
    expect(linkFor({ path: 'journal/p.png', kind: 'image' }, 'journal/notes.md')).toBe('![p.png](p.png)')
  })

  it('gives a folder a trailing slash, or its index resolves against the wrong directory', () => {
    expect(linkFor({ path: 'journal', kind: 'folder' }, 'notes.md')).toBe('[journal](journal/)')
  })

  it('walks upwards when the entry is above the document', () => {
    expect(linkFor({ path: 'top.md', kind: 'document' }, 'journal/2026/notes.md')).toBe('[top.md](../../top.md)')
  })

  it('encodes a space, which would otherwise end the destination', () => {
    expect(linkFor({ path: 'my file.md', kind: 'document' }, 'notes.md')).toBe('[my file.md](my%20file.md)')
  })

  it('encodes a folder name before adding its slash', () => {
    expect(linkFor({ path: 'my folder', kind: 'folder' }, 'notes.md')).toBe('[my folder](my%20folder/)')
  })
})
