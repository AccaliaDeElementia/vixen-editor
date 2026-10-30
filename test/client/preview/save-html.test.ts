'use sanity'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { saveAsHtml, TestOnly } from '../../../src/client/preview/save-html.ts'

const { htmlDocumentOf } = TestOnly

const A_DOCUMENT = '# Printed\n\nwith prose\n'

let saved: File[] = []

function saving(entryPath = 'folder/notes.md', markdown = A_DOCUMENT): void {
  saveAsHtml({ entryPath, markdown }, (file: File) => {
    saved.push(file)
  })
}

afterEach(() => {
  saved = []
  vi.restoreAllMocks()
})

describe('the file a saved copy becomes', () => {
  it('is named for the document, with the extension it now has', () => {
    saving()

    expect(saved.map((file) => file.name)).toStrictEqual(['notes.html'])
  })

  it('says it is html, so a browser opening it renders rather than downloads it again', () => {
    saving()

    expect(saved.map((file) => file.type)).toStrictEqual(['text/html;charset=utf-8'])
  })

  it('carries the document it was made from', async () => {
    saving()

    await expect(saved[0]?.text()).resolves.toContain('<h1>Printed</h1>')
  })
})

describe('the html a saved copy holds', () => {
  it('is a whole document, rather than the fragment the editor renders', () => {
    const held = htmlDocumentOf({ entryPath: 'notes.md', markdown: A_DOCUMENT })

    expect(held.startsWith('<!doctype html>\n<html lang="en">')).toBe(true)
  })

  it('declares the encoding, because a saved file has no server to say it', () => {
    expect(htmlDocumentOf({ entryPath: 'notes.md', markdown: A_DOCUMENT })).toContain('<meta charset="utf-8">')
  })

  it('titles itself for the document it came from', () => {
    expect(htmlDocumentOf({ entryPath: 'folder/notes.md', markdown: A_DOCUMENT })).toContain('<title>notes</title>')
  })

  it('escapes a name that would otherwise be markup of its own', () => {
    const held = htmlDocumentOf({ entryPath: '<script>.md', markdown: A_DOCUMENT })

    expect(held).toContain('<title>&lt;script&gt;</title>')
  })

  it('carries no stylesheet, so it pastes into another document as that document', () => {
    expect(htmlDocumentOf({ entryPath: 'notes.md', markdown: A_DOCUMENT })).not.toContain('<style')
  })

  it('carries the document rendered, not its markdown', () => {
    expect(htmlDocumentOf({ entryPath: 'notes.md', markdown: A_DOCUMENT })).toContain('<h1>Printed</h1>')
  })
})

describe('handing the file to the browser', () => {
  it('offers it as a download named for the document, rather than opening it', () => {
    const made = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vixen')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)

    saveAsHtml({ entryPath: 'folder/notes.md', markdown: A_DOCUMENT })

    expect(made.mock.calls.map(([held]) => (held instanceof File ? held.name : 'not a file'))).toStrictEqual([
      'notes.html',
    ])
  })
})
