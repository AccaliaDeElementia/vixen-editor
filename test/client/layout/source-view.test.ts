'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

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
  return host.querySelector<HTMLElement>('[data-part="source-body"]')
}

beforeEach(() => {
  document.body.innerHTML = ''
  host = page()
})

describe('showing the html the preview renders', () => {
  it('shows the tags the document is converted into', () => {
    createSourceView(host).show('# A heading\n\nprose')

    expect(body()?.textContent).toBe('<h1>A heading</h1>\n<p>prose</p>')
  })

  it('highlights it as html, so it reads as deliberate rather than raw', () => {
    createSourceView(host).show('# A heading')

    expect(body()?.querySelectorAll('span').length).toBeGreaterThan(0)
  })

  it('shows what the markup became rather than the markup a reader wrote', () => {
    createSourceView(host).show('A **bold** word')

    expect(body()?.textContent).toContain('<strong>bold</strong>')
  })

  it('replaces what it showed before, rather than appending to it', () => {
    const source = createSourceView(host)
    source.show('first')

    source.show('second')

    expect(body()?.textContent).toBe('<p>second</p>')
  })

  it('shows an empty document as nothing at all', () => {
    createSourceView(host).show('')

    expect(body()?.textContent).toBe('')
  })
})

describe('a pane with no source section in it', () => {
  it('declines rather than failing', () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    createSourceView(bare).show('# ignored')

    expect(bare.childElementCount).toBe(0)
  })
})
