'use sanity'

import { describe, expect, it } from 'vitest'

import { createTemplateRenderer } from '../../src/server/templates.ts'
import { archiveUrlFor } from '../../src/shared/api.ts'
import { STORE_ROOT } from '../../src/shared/store-path.ts'

const CONTROL = /<(?:button|a)\b[^>]*>/gv
const IDENTIFIED = /id="(?<id>[^"]*)"/v
const NONE = 0

function renderedPage(): string {
  return createTemplateRenderer('src/templates', false).render('editor', {
    title: 'Vixen Editor',
    archiveUrl: archiveUrlFor(STORE_ROOT),
  })
}

function controlsIn(html: string, className: string): string[] {
  return [...html.matchAll(CONTROL)].map(([tag]) => tag).filter((tag) => tag.includes(className))
}

function identify(tag: string): string {
  return IDENTIFIED.exec(tag)?.groups?.id ?? tag
}

function lacking(attribute: string, tags: readonly string[]): string[] {
  return tags.filter((tag) => !tag.includes(`${attribute}="`)).map(identify)
}

const page = renderedPage()
const ribbon = controlsIn(page, 'ribbon__button')
const toolbar = controlsIn(page, 'explorer__action')

describe('the controls in the ribbon', () => {
  it('each carry a title, so a pointer is told what the glyph means', () => {
    expect(lacking('title', ribbon)).toStrictEqual([])
  })

  it('each carry a name anything that cannot see them can read', () => {
    expect(lacking('aria-label', ribbon)).toStrictEqual([])
  })
})

describe('the controls in the file browser toolbar', () => {
  it('each carry a title, so the two rails behave alike', () => {
    expect(lacking('title', toolbar)).toStrictEqual([])
  })

  it('each carry a name anything that cannot see them can read', () => {
    expect(lacking('aria-label', toolbar)).toStrictEqual([])
  })
})

describe('the scan itself', () => {
  it('finds controls in both rails, so an empty result cannot read as a pass', () => {
    expect(Math.min(ribbon.length, toolbar.length)).toBeGreaterThan(NONE)
  })

  it('names a control that carries nothing, rather than passing it over', () => {
    expect(lacking('title', ['<button class="ribbon__button" id="mystery" type="button">'])).toStrictEqual(['mystery'])
  })
})
