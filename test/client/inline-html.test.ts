'use sanity'

import { describe, expect, it } from 'vitest'

import { closesATag, holdsNothing, openedBy } from '../../src/client/inline-html.ts'
import { sanitiseHtml } from '../../src/client/sanitise-html.ts'

function allowingSpans(source: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  if (source.includes('span')) fragment.append(document.createElement('span'))

  return fragment
}

function allowingNothing(): DocumentFragment {
  return document.createDocumentFragment()
}

describe('telling one end of a tag from the other', () => {
  it('reads a closing tag as one', () => {
    expect(closesATag('</span>')).toBe(true)
  })

  it('reads an opening tag as not one', () => {
    expect(closesATag('<span>')).toBe(false)
  })
})

describe('what a tag opens', () => {
  it('gives back the element the sanitiser allowed', () => {
    expect(openedBy('<span>', allowingSpans)?.localName).toBe('span')
  })

  it('gives back nothing when the sanitiser allowed nothing', () => {
    expect(openedBy('<script>', allowingNothing)).toBeNull()
  })

  it('gives back nothing for a tag the real allowlist refuses', () => {
    expect(openedBy('<script>', sanitiseHtml)).toBeNull()
  })
})

describe('whether what opened can hold anything', () => {
  it('says a line break cannot', () => {
    expect(holdsNothing(document.createElement('br'))).toBe(true)
  })

  it('says a span can', () => {
    expect(holdsNothing(document.createElement('span'))).toBe(false)
  })
})
