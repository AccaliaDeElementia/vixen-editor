'use sanity'

import { NOT_FOUND, SEQUENCE_START } from '../../shared/sequences.ts'

import { Buffer } from 'node:buffer'

import { extensionOf } from './safe-path.ts'

const SVG_HEAD_BYTES = 1024

// A WebP file is a RIFF container whose four-byte form type sits at offset 8.
const WEBP_FORM_OFFSET = 8

// Leading constructs an XML document may carry before its root element, each
// paired with the text that closes it. The comment opener has to be tried
// before the bare markup declaration, since `<!--` also starts with `<!`.
const XML_PROLOGUE: ReadonlyArray<readonly [string, string]> = [
  ['<?', '?>'],
  ['<!--', '-->'],
  ['<!', '>'],
]

const PNG = Buffer.from('89504e470d0a1a0a', 'hex')
const JPEG = Buffer.from('ffd8ff', 'hex')
const GIF87A = Buffer.from('GIF87a', 'ascii')
const GIF89A = Buffer.from('GIF89a', 'ascii')
const RIFF = Buffer.from('RIFF', 'ascii')
const WEBP = Buffer.from('WEBP', 'ascii')

const PROLOGUE_OPEN = 0
const PROLOGUE_CLOSE = 1

function startsWith(bytes: Uint8Array, expected: Uint8Array, offset = SEQUENCE_START): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte)
}

function isPng(bytes: Uint8Array): boolean {
  return startsWith(bytes, PNG)
}

function isJpeg(bytes: Uint8Array): boolean {
  return startsWith(bytes, JPEG)
}

function isGif(bytes: Uint8Array): boolean {
  return startsWith(bytes, GIF87A) || startsWith(bytes, GIF89A)
}

function isWebp(bytes: Uint8Array): boolean {
  return startsWith(bytes, RIFF) && startsWith(bytes, WEBP, WEBP_FORM_OFFSET)
}

function prologueAt(text: string): readonly [string, string] | undefined {
  return XML_PROLOGUE.find(([opener]) => text.startsWith(opener))
}

function afterPrologue(text: string): string {
  let rest = text.trimStart()

  for (;;) {
    const construct = prologueAt(rest)
    if (construct === undefined) return rest

    const end = rest.indexOf(construct[PROLOGUE_CLOSE], construct[PROLOGUE_OPEN].length)
    if (end === NOT_FOUND) return ''

    rest = rest.slice(end + construct[PROLOGUE_CLOSE].length).trimStart()
  }
}

function isSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf8').decode(bytes.subarray(SEQUENCE_START, SVG_HEAD_BYTES))

  return /^<svg[\s/>]/i.test(afterPrologue(head))
}

const SIGNATURES: Readonly<Record<string, (bytes: Uint8Array) => boolean>> = {
  '.png': isPng,
  '.jpg': isJpeg,
  '.jpeg': isJpeg,
  '.gif': isGif,
  '.webp': isWebp,
  '.svg': isSvg,
}

export function contentMatchesExtension(entryPath: string, bytes: Uint8Array): boolean {
  const check = SIGNATURES[extensionOf(entryPath)]

  return check === undefined || check(bytes)
}
