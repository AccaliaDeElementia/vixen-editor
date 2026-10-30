'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { pointImagesAtTheStore } from '../../../src/client/preview/image-sources.ts'

const HOLDER = 'Two Folder/Day 1.md'

let rendered: HTMLElement = document.createElement('div')

function sourcesShown(markup: string): Array<string | null> {
  rendered.innerHTML = markup
  pointImagesAtTheStore(rendered, HOLDER)

  return [...rendered.querySelectorAll('img')].map((image) => image.getAttribute('src'))
}

beforeEach(() => {
  document.body.innerHTML = ''
  rendered = document.createElement('div')
  document.body.append(rendered)
})

describe('where a rendered image is fetched from', () => {
  it('is the store, for a source written beside the document', () => {
    expect(sourcesShown('<p><img src="picture.png" alt="a"></p>')).toStrictEqual([
      '/api/files/raw/Two%20Folder/picture.png',
    ])
  })

  it('is the store for one the document climbs out of its folder to reach', () => {
    expect(sourcesShown('<p><img src="../image.png" alt="a"></p>')).toStrictEqual(['/api/files/raw/image.png'])
  })

  it('is wherever it said, for a source the store does not hold', () => {
    expect(sourcesShown('<img src="https://example.test/moon.png" alt="a">')).toStrictEqual([
      'https://example.test/moon.png',
    ])
  })

  it('is nowhere for an image that names no source, which is left as the document wrote it', () => {
    expect(sourcesShown('<img alt="nothing">')).toStrictEqual([null])
  })

  it('is each of them, where a document shows more than one', () => {
    expect(sourcesShown('<img src="one.png" alt="a"><img src="two.png" alt="b">')).toStrictEqual([
      '/api/files/raw/Two%20Folder/one.png',
      '/api/files/raw/Two%20Folder/two.png',
    ])
  })
})
