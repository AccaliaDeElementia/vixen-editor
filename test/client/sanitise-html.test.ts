'use sanity'

import { describe, expect, it } from 'vitest'

import { sanitiseHtml, TestOnly } from '../../src/client/sanitise-html.ts'

const { ALLOWED_ATTR, ALLOWED_TAGS } = TestOnly

describe('what the allowlist lets through', () => {
  it('permits the structure a document legitimately carries', () => {
    expect(ALLOWED_TAGS).toContain('table')
  })

  it('permits a hyperlink, which is the whole point of keeping any of it', () => {
    expect(ALLOWED_TAGS).toContain('a')
  })

  it('permits no script element, whatever else changes here', () => {
    expect(ALLOWED_TAGS).not.toContain('script')
  })

  it('permits no style element, because a document may not restyle the app', () => {
    expect(ALLOWED_TAGS).not.toContain('style')
  })

  it('permits no iframe, object or embed', () => {
    expect(ALLOWED_TAGS.filter((tag) => ['embed', 'iframe', 'object'].includes(tag))).toStrictEqual([])
  })

  it('permits no base element, which would rewrite every relative URL on the page', () => {
    expect(ALLOWED_TAGS).not.toContain('base')
  })

  it('permits no form, which would post somewhere of its choosing', () => {
    expect(ALLOWED_TAGS).not.toContain('form')
  })
})

describe('what the allowlist lets through as attributes', () => {
  it('permits a destination, so a link and an image work', () => {
    expect(ALLOWED_ATTR).toContain('href')
  })

  it('permits no style attribute, which is the one beacon DOMPurify keeps by default', () => {
    expect(ALLOWED_ATTR).not.toContain('style')
  })

  it('permits no event handler', () => {
    expect(ALLOWED_ATTR.filter((attribute) => attribute.startsWith('on'))).toStrictEqual([])
  })

  it('permits no class, so a document cannot dress itself as the application', () => {
    expect(ALLOWED_ATTR).not.toContain('class')
  })
})

describe('sanitising', () => {
  it('gives back a fragment, so nothing is ever assigned through innerHTML', () => {
    expect(sanitiseHtml('<p>safe</p>')).toBeInstanceOf(DocumentFragment)
  })
})
