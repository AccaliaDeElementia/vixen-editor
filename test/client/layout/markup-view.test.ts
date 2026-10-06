'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createMarkupView } from '../../../src/client/layout/markup-view.ts'
import { createSourceView } from '../../../src/client/layout/source-view.ts'

import { renderPane } from '../templates.ts'

let host: HTMLElement = document.createElement('div')

function page(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderPane()
  document.body.append(container)

  return container
}

function body(): HTMLElement | null {
  return host.querySelector<HTMLElement>('[data-part="markup-body"]')
}

function sectionFor(part: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-part="${part}"]`)
}

beforeEach(() => {
  document.body.innerHTML = ''
  host = page()
})

describe('showing a document rendered', () => {
  it('renders a heading as a heading rather than as its markup', () => {
    createMarkupView(host).show('# A heading')

    expect(body()?.querySelector('h1')?.textContent).toBe('A heading')
  })

  it('renders emphasis as emphasis', () => {
    createMarkupView(host).show('a **bold** word')

    expect(body()?.querySelector('strong')?.textContent).toBe('bold')
  })

  it('replaces what it rendered before rather than appending', () => {
    const markup = createMarkupView(host)
    markup.show('# first')

    markup.show('# second')

    expect(body()?.querySelectorAll('h1')).toHaveLength(1)
  })

  it('shows raw HTML as source rather than running it', () => {
    createMarkupView(host).show('<img src=x onerror="window.pwned = 1">')

    expect(body()?.querySelector('img')).toBeNull()
  })

  it('brings itself into view', () => {
    createMarkupView(host).show('# shown')

    expect(sectionFor('view-markup')?.hidden).toBe(false)
  })
})

describe('two previews in one pane', () => {
  it('puts the rendered view away when the source is asked for', () => {
    createMarkupView(host).show('# markup')

    createSourceView(host).show('# source')

    expect(sectionFor('view-markup')?.hidden).toBe(true)
  })

  it('puts the source away when the rendered view is asked for', () => {
    createSourceView(host).show('# source')

    createMarkupView(host).show('# markup')

    expect(sectionFor('view-source')?.hidden).toBe(true)
  })
})

describe('a pane with nowhere to render', () => {
  it('declines rather than failing', () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    createMarkupView(bare).show('# ignored')

    expect(bare.childElementCount).toBe(0)
  })
})
