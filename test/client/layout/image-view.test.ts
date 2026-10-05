'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createImageView, type ImageView } from '../../../src/client/layout/image-view.ts'

import { renderSection } from '../templates.ts'

let revealed: string[] = []
let broken: string[] = []

function page(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderSection('[data-part="view-image"]')
  document.body.append(container)

  return container
}

function view(root: ParentNode): ImageView {
  return createImageView({
    host: root,
    reveal: (at: string) => {
      revealed.push(at)
    },
    onBroken: (entryPath: string) => {
      broken.push(entryPath)
    },
  })
}

function fileIn(root: ParentNode): HTMLImageElement | null {
  return root.querySelector<HTMLImageElement>('[data-part="image-file"]')
}

beforeEach(() => {
  document.body.innerHTML = ''
  revealed = []
  broken = []
})

describe('showing an image', () => {
  it('points the element at the raw route, not at the documents api', () => {
    const root = page()

    view(root).offer('journal/photo.png')

    expect(fileIn(root)?.getAttribute('src')).toBe('/api/files/raw/journal/photo.png')
  })

  it('names the path in the chrome, so the user can see where they are', () => {
    const root = page()

    view(root).offer('journal/photo.png')

    expect(root.querySelector('[data-part="image-path"]')?.textContent).toBe('journal/photo.png')
  })

  it('describes the image by its path rather than leaving the alt empty', () => {
    const root = page()

    view(root).offer('journal/photo.png')

    expect(fileIn(root)?.alt).toBe('journal/photo.png')
  })

  it('waits for the image before revealing the view, so a slow load is not a blank frame', () => {
    const root = page()

    view(root).offer('journal/photo.png')

    expect(revealed).toStrictEqual([])
  })

  it('reveals it once the bytes have arrived', () => {
    const root = page()
    view(root).offer('journal/photo.png')

    fileIn(root)?.dispatchEvent(new Event('load'))

    expect(revealed).toStrictEqual(['journal/photo.png'])
  })
})

describe('the download offer', () => {
  it('downloads the same bytes the view is showing', () => {
    const root = page()

    view(root).offer('journal/photo.png')

    expect(root.querySelector<HTMLAnchorElement>('[data-part="image-download"]')?.getAttribute('href')).toBe(
      '/api/files/raw/journal/photo.png',
    )
  })

  it('saves under the file’s own name, not the whole path', () => {
    const root = page()

    view(root).offer('journal/2026/photo.png')

    expect(root.querySelector<HTMLAnchorElement>('[data-part="image-download"]')?.download).toBe('photo.png')
  })

  it('names a file at the store root correctly too', () => {
    const root = page()

    view(root).offer('photo.png')

    expect(root.querySelector<HTMLAnchorElement>('[data-part="image-download"]')?.download).toBe('photo.png')
  })
})

describe('an image that will not load', () => {
  it('falls through to the missing path, because a deleted image is a missing path', () => {
    const root = page()
    view(root).offer('journal/gone.png')

    fileIn(root)?.dispatchEvent(new Event('error'))

    expect(broken).toStrictEqual(['journal/gone.png'])
  })

  it('does not reveal the image view first', () => {
    const root = page()
    view(root).offer('journal/gone.png')

    fileIn(root)?.dispatchEvent(new Event('error'))

    expect(revealed).toStrictEqual([])
  })
})

describe('a second image opened after the first', () => {
  it('reports the one currently showing, not the one before it', () => {
    const root = page()
    const images = view(root)

    images.offer('first.png')
    images.offer('second.png')
    fileIn(root)?.dispatchEvent(new Event('load'))

    expect(revealed).toStrictEqual(['second.png'])
  })
})

describe('markup that does not match', () => {
  it('declines rather than throwing, the way the dialog does', () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    expect(() => {
      view(bare).offer('photo.png')
    }).not.toThrow()
  })

  it('reveals nothing it cannot show', () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    view(bare).offer('photo.png')

    expect(revealed).toStrictEqual([])
  })
})

describe('a path with characters that need encoding', () => {
  it('encodes them in both the source and the download link', () => {
    const root = page()

    view(root).offer('my journal/a b.png')

    expect({
      src: fileIn(root)?.getAttribute('src'),
      href: root.querySelector<HTMLAnchorElement>('[data-part="image-download"]')?.getAttribute('href'),
    }).toStrictEqual({
      src: '/api/files/raw/my%20journal/a%20b.png',
      href: '/api/files/raw/my%20journal/a%20b.png',
    })
  })
})
