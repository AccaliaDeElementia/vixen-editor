'use sanity'

import { describe, expect, it } from 'vitest'

import { createTemplateRenderer } from '../../src/server/templates.ts'

function renderedHead(): string {
  const page = createTemplateRenderer('src/templates', false).render('editor', { title: 'Vixen Editor' })
  const { head } = /<head>(?<head>[\s\S]*)<\/head>/v.exec(page)?.groups ?? {}
  if (head === undefined) throw new Error('the rendered page has no head')

  return head
}

describe('what the page tells a browser about its colours', () => {
  it('declares itself dark, so native controls and scrollbars match the theme', () => {
    expect(renderedHead()).toContain('<meta name="color-scheme" content="dark">')
  })

  it('locks out an extension that would darken it a second time', () => {
    expect(renderedHead()).toContain('<meta name="darkreader-lock">')
  })
})
