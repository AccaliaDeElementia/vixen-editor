'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { given } from '../conditions.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTemplateRenderer, TestOnly } from '../../src/server/templates.ts'

const { TemplateNotFoundError } = TestOnly

let templatesDir = ''

async function writeTemplate(name: string, body: string): Promise<void> {
  await fs.writeFile(path.join(templatesDir, `${name}.pug`), body)
}

beforeEach(async () => {
  templatesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-templates-'))
})

afterEach(async () => {
  await fs.rm(templatesDir, { recursive: true, force: true })
})

describe('rendering', () => {
  it('renders a template to markup', async () => {
    await writeTemplate('page', 'h1 Vixen Editor')

    expect(createTemplateRenderer(templatesDir).render('page')).toBe('<h1>Vixen Editor</h1>')
  })

  it('injects locals', async () => {
    await writeTemplate('page', 'h1= title')

    expect(createTemplateRenderer(templatesDir).render('page', { title: 'Hello' })).toBe('<h1>Hello</h1>')
  })

  it('renders with no locals at all', async () => {
    await writeTemplate('page', 'p static')

    expect(createTemplateRenderer(templatesDir).render('page')).toBe('<p>static</p>')
  })

  it('escapes interpolated locals', async () => {
    await writeTemplate('page', 'h1= title')

    const html = createTemplateRenderer(templatesDir).render('page', { title: '<script>alert(1)</script>' })

    expect({ raw: html.includes('<script>'), escaped: html.includes('&lt;script&gt;') }).toStrictEqual({
      raw: false,
      escaped: true,
    })
  })

  it('resolves a layout that the template extends', async () => {
    await writeTemplate('layout', 'html\n  body\n    block content')
    await writeTemplate('child', 'extends layout\n\nblock content\n  p nested')

    expect(createTemplateRenderer(templatesDir).render('child')).toContain('<p>nested</p>')
  })

  it('throws TemplateNotFoundError for a template that does not exist', () => {
    expect(() => createTemplateRenderer(templatesDir).render('missing')).toThrow(TemplateNotFoundError)
  })

  it('names the missing template in the error', () => {
    expect(() => createTemplateRenderer(templatesDir).render('missing')).toThrow(/missing/v)
  })

  it('surfaces a malformed template rather than reporting it as missing', async () => {
    await writeTemplate('broken', 'h1= (')

    given(() => {
      expect(() => createTemplateRenderer(templatesDir).render('broken')).toThrow()
    })

    expect(() => createTemplateRenderer(templatesDir).render('broken')).not.toThrow(TemplateNotFoundError)
  })
})

describe('caching', () => {
  it('serves the compiled template from cache when caching is on', async () => {
    await writeTemplate('page', 'p first')
    const renderer = createTemplateRenderer(templatesDir, true)

    given(() => {
      expect(renderer.render('page')).toBe('<p>first</p>')
    })
    await writeTemplate('page', 'p second')

    expect(renderer.render('page')).toBe('<p>first</p>')
  })

  it('recompiles on every render when caching is off, so edits appear without a restart', async () => {
    await writeTemplate('page', 'p first')
    const renderer = createTemplateRenderer(templatesDir, false)

    given(() => {
      expect(renderer.render('page')).toBe('<p>first</p>')
    })
    await writeTemplate('page', 'p second')

    expect(renderer.render('page')).toBe('<p>second</p>')
  })

  it('caches by default', async () => {
    await writeTemplate('page', 'p first')
    const renderer = createTemplateRenderer(templatesDir)

    renderer.render('page')
    await writeTemplate('page', 'p second')

    expect(renderer.render('page')).toBe('<p>first</p>')
  })

  it('keeps separate templates apart in the cache', async () => {
    await writeTemplate('one', 'p one')
    await writeTemplate('two', 'p two')
    const renderer = createTemplateRenderer(templatesDir)

    given(() => {
      expect(renderer.render('one')).toBe('<p>one</p>')
      expect(renderer.render('two')).toBe('<p>two</p>')
    })

    expect(renderer.render('one')).toBe('<p>one</p>')
  })
})
