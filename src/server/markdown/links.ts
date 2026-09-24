'use sanity'

import { parse, postprocess, preprocess } from 'micromark'

interface LinkDestination {
  value: string
  start: number
  end: number
  bracketed: boolean
}

const DESTINATION_TOKENS = new Set(['resourceDestinationString', 'definitionDestinationString'])

// CommonMark: a backslash escapes any ASCII punctuation character.
const BACKSLASH_ESCAPE = /\\(?<punctuation>[!-/:-@[-`{-~])/gu
const PERCENT_RUN = /(?:%[0-9A-Fa-f]{2})+/gu
const CHARACTER_REFERENCE = /^&(?:#\d+|#[xX][0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/u

const HEX = 16
const BYTE_DIGITS = 2

const ALWAYS_ENCODED = new Set(['%', '\\'])
const OUTSIDE_BRACKETS = new Set([' ', '(', ')', '"', '<', '>'])
const INSIDE_BRACKETS = new Set(['<', '>'])

function decodePercentRun(run: string): string {
  try {
    return decodeURIComponent(run)
  } catch {
    return run
  }
}

export function decodeDestination(raw: string): string {
  return raw.replace(BACKSLASH_ESCAPE, '$<punctuation>').replace(PERCENT_RUN, decodePercentRun)
}

function percentEncode(character: string): string {
  const bytes = new TextEncoder().encode(character)

  return Array.from(bytes, (byte) => `%${byte.toString(HEX).toUpperCase().padStart(BYTE_DIGITS, '0')}`).join('')
}

function mustEncode(character: string, bracketed: boolean): boolean {
  if (ALWAYS_ENCODED.has(character)) return true

  return bracketed ? INSIDE_BRACKETS.has(character) : OUTSIDE_BRACKETS.has(character)
}

export function encodeDestination(value: string, bracketed: boolean): string {
  let encoded = ''
  let offset = 0

  for (const character of value) {
    const opensReference = character === '&' && CHARACTER_REFERENCE.test(value.slice(offset))
    encoded += mustEncode(character, bracketed) || opensReference ? percentEncode(character) : character
    offset += character.length
  }

  return encoded
}

export function findLinkDestinations(markdown: string): LinkDestination[] {
  const events = postprocess(
    parse()
      .document()
      .write(preprocess()(markdown, undefined, true)),
  )
  const found: LinkDestination[] = []

  for (const [kind, token] of events) {
    if (kind !== 'enter' || !DESTINATION_TOKENS.has(token.type)) continue

    const { offset: start } = token.start
    const { offset: end } = token.end

    found.push({
      value: decodeDestination(markdown.slice(start, end)),
      start,
      end,
      bracketed: markdown[start - 1] === '<',
    })
  }

  return found
}

// Returning the destination unchanged leaves its bytes exactly as the author
// wrote them, which is what keeps an identity rewrite byte-identical: the
// written form and the decoded value are not the same string.
export function rewriteLinkDestinations(markdown: string, rewrite: (destination: string) => string): string {
  let result = markdown

  for (const destination of findLinkDestinations(markdown).reverse()) {
    const replacement = rewrite(destination.value)
    if (replacement === destination.value) continue

    const encoded = encodeDestination(replacement, destination.bracketed)
    result = result.slice(0, destination.start) + encoded + result.slice(destination.end)
  }

  return result
}
