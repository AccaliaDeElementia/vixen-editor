'use sanity'

import { describe, expect, it } from 'vitest'

import { createTemplateRenderer } from '../../src/server/templates.ts'

const A_BUILD = 'c0ffee'

function renderedPage(buildId: string | null = null): string {
  return createTemplateRenderer('src/templates', false).render('editor', { title: 'Vixen Editor', buildId })
}

function renderedHead(buildId: string | null = null): string {
  const { head } = /<head>(?<head>[\s\S]*)<\/head>/v.exec(renderedPage(buildId))?.groups ?? {}
  if (head === undefined) throw new Error('the rendered page has no head')

  return head
}

describe('what the page tells a browser about its colours', () => {
  it('declares both schemes, so native controls and scrollbars follow the one in use', () => {
    expect(renderedHead()).toContain('<meta name="color-scheme" content="light dark">')
  })
})

describe('what the page asks the browser to keep', () => {
  it('names the stylesheet with the build id, so a rebuild is not served from cache', () => {
    expect(renderedHead(A_BUILD)).toContain(`href="/assets/main.css?v=${A_BUILD}"`)
  })

  it('names the script with the same build id, so the two cannot be cached out of step', () => {
    expect(renderedPage(A_BUILD)).toContain(`src="/assets/main.js?v=${A_BUILD}"`)
  })

  it('asks for the bare paths when the build cannot be identified, rather than inventing a version', () => {
    expect(renderedHead()).toContain('href="/assets/main.css"')
  })

  it('leaves the icon font unversioned, because the stylesheet asks for it by the bare path', () => {
    expect(renderedHead(A_BUILD)).toContain('href="/assets/material-symbols-outlined.woff2"')
  })
})
