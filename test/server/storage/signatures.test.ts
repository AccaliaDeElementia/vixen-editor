'use sanity'

import { describe, expect, it } from 'vitest'

import { contentMatchesExtension, detectedFormat } from '../../../src/server/storage/signatures.ts'

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10)
const GIF87 = text('GIF87a........')
const GIF89 = text('GIF89a........')
const WEBP = text('RIFF____WEBPVP8 ')
const HTML = text('<!doctype html><html><body>hi</body></html>')

describe('accepts content that matches its extension', () => {
  it.each([
    ['png', 'photo.png', PNG],
    ['jpeg under .jpg', 'photo.jpg', JPEG],
    ['jpeg under .jpeg', 'photo.jpeg', JPEG],
    ['gif87a', 'photo.gif', GIF87],
    ['gif89a', 'photo.gif', GIF89],
    ['webp', 'photo.webp', WEBP],
    ['an uppercase extension', 'PHOTO.PNG', PNG],
  ])('%s', (_label, entryPath, content) => {
    expect(contentMatchesExtension(entryPath, content)).toBe(true)
  })
})

describe('rejects content that does not match its extension', () => {
  it.each([
    ['html wearing a .png name', 'photo.png', HTML],
    ['a png wearing a .jpg name', 'photo.jpg', PNG],
    ['a jpeg wearing a .gif name', 'photo.gif', JPEG],
    ['a gif wearing a .webp name', 'photo.webp', GIF89],
    ['a riff container that is not webp', 'photo.webp', text('RIFF____WAVEfmt ')],
    ['an empty file', 'photo.png', bytes()],
    ['a file shorter than the signature', 'photo.png', bytes(0x89, 0x50)],
  ])('%s', (_label, entryPath, content) => {
    expect(contentMatchesExtension(entryPath, content)).toBe(false)
  })
})

describe('text documents carry no signature to check', () => {
  it.each([
    ['markdown', 'notes.md'],
    ['plain text', 'notes.txt'],
  ])('accepts any bytes for %s, because the extension allowlist is the only gate', (_label, entryPath) => {
    expect(contentMatchesExtension(entryPath, PNG)).toBe(true)
  })
})

describe('svg', () => {
  it.each([
    ['a bare root element', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['leading whitespace', '\n\n  <svg></svg>'],
    ['an xml declaration', '<?xml version="1.0"?><svg></svg>'],
    ['a doctype', '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" ""><svg></svg>'],
    ['a comment', '<!-- drawn by hand --><svg></svg>'],
    ['several prologue constructs', '<?xml version="1.0"?>\n<!-- a --><!-- b -->\n<svg></svg>'],
    ['an uppercase root element', '<SVG></SVG>'],
    ['a self-closing root element', '<svg/>'],
  ])('accepts %s', (_label, content) => {
    expect(contentMatchesExtension('drawing.svg', text(content))).toBe(true)
  })

  it.each([
    ['html', HTML],
    ['a png wearing an .svg name', PNG],
    ['an empty file', bytes()],
    ['text before the root element', text('surprise<svg></svg>')],
    ['an element that merely starts with svg', text('<svgish></svgish>')],
    ['an unterminated comment', text('<!-- never closed <svg></svg>')],
    ['an unterminated xml declaration', text('<?xml version="1.0"')],
    ['an unterminated doctype', text('<!DOCTYPE svg')],
  ])('rejects %s', (_label, content) => {
    expect(contentMatchesExtension('drawing.svg', content)).toBe(false)
  })

  it('looks no further than the head of a large file', () => {
    const padded = text(`<!--${' '.repeat(4096)}--><svg></svg>`)

    expect(contentMatchesExtension('drawing.svg', padded)).toBe(false)
  })
})

describe('detectedFormat', () => {
  it.each([
    ['png', PNG, '.png'],
    ['jpeg', JPEG, '.jpg'],
    ['gif87a', GIF87, '.gif'],
    ['gif89a', GIF89, '.gif'],
    ['webp', WEBP, '.webp'],
    ['svg', text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), '.svg'],
  ])('names the format of %s, so a rename can be offered', (_case, content, extension) => {
    expect(detectedFormat(content)).toBe(extension)
  })

  it('reports jpeg under its canonical extension, not the alias', () => {
    expect(detectedFormat(JPEG)).not.toBe('.jpeg')
  })

  it('recognises nothing in content that is not an image at all', () => {
    expect(detectedFormat(HTML)).toBeNull()
  })

  it('agrees with the matcher, or a rejection could offer a name that is refused', () => {
    const detected = detectedFormat(PNG)

    expect(detected === null ? false : contentMatchesExtension(`photo${detected}`, PNG)).toBe(true)
  })
})
