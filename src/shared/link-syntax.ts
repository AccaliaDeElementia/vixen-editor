'use sanity'

import { SEQUENCE_START } from './sequences.ts'

const CHARACTER_REFERENCE = /^&(?:#\d+|#[xX][0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/v

// CommonMark: a backslash escapes any ASCII punctuation character.
const BACKSLASH_ESCAPE = /\\(?<punctuation>[!-\/:-@\[-`\{-~])/gv
const PERCENT_RUN = /(?:%[0-9A-Fa-f]{2})+/gv

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

const HEX = 16
const BYTE_DIGITS = 2

const ALWAYS_ENCODED = new Set(['%', '\\'])
const OUTSIDE_BRACKETS = new Set([' ', '(', ')', '"', '<', '>'])
const INSIDE_BRACKETS = new Set(['<', '>'])

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
  let offset = SEQUENCE_START

  for (const character of value) {
    const opensReference = character === '&' && CHARACTER_REFERENCE.test(value.slice(offset))
    encoded += mustEncode(character, bracketed) || opensReference ? percentEncode(character) : character
    offset += character.length
  }

  return encoded
}
