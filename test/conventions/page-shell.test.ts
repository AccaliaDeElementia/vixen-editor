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
  it('declares both schemes, so native controls and scrollbars follow the one in use', () => {
    expect(renderedHead()).toContain('<meta name="color-scheme" content="light dark">')
  })
})
