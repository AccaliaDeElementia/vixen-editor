'use sanity'

import { describe, expect, it } from 'vitest'

import { createTemplateRenderer } from '../../src/server/templates.ts'
import { archiveUrlFor } from '../../src/shared/api.ts'
import { STORE_ROOT } from '../../src/shared/store-path.ts'

const CONTROL = /<(?:button|a)\b[^>]*>/gv
const IDENTIFIED = /id="(?<id>[^"]*)"/v
const PARTED = /data-part="(?<part>[^"]*)"/v
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

function partsIn(tags: readonly string[]): string[] {
  return tags.flatMap((tag) => PARTED.exec(tag)?.groups?.part ?? [])
}

function lacking(attribute: string, tags: readonly string[]): string[] {
  return tags.filter((tag) => !tag.includes(`${attribute}="`)).map(identify)
}

const page = renderedPage()
const ribbon = controlsIn(page, 'ribbon__button')
const toolbar = controlsIn(page, 'explorer__action')
const editing = controlsIn(page, '"control"')

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

describe('the controls in the editing bar', () => {
  it('each carry a title, so a pointer is told what the glyph means', () => {
    expect(lacking('title', editing)).toStrictEqual([])
  })

  it('each carry a name anything that cannot see them can read', () => {
    expect(lacking('aria-label', editing)).toStrictEqual([])
  })
})

describe('where each control lives', () => {
  it('puts the split controls in the ribbon, beside the other controls that act on the workspace', () => {
    expect(ribbon.map(identify).filter((id) => id.startsWith('split-'))).toStrictEqual(['split-beside', 'split-below'])
  })

  it('puts the preview controls in the editing bar, since they only mean anything with an editor open', () => {
    expect([...new Set(partsIn(editing))].filter((part) => part.startsWith('preview-'))).toStrictEqual([
      'preview-markup',
      'preview-source',
    ])
  })
})

describe('the scan itself', () => {
  it('finds controls in every bar, so an empty result cannot read as a pass', () => {
    expect(Math.min(ribbon.length, toolbar.length, editing.length)).toBeGreaterThan(NONE)
  })

  it('names a control that carries nothing, rather than passing it over', () => {
    expect(lacking('title', ['<button class="ribbon__button" id="mystery" type="button">'])).toStrictEqual(['mystery'])
  })
})
