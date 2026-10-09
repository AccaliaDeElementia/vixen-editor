'use sanity'

const NAMED: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['apos', "'"],
  ['copy', '©'],
  ['gt', '>'],
  ['hellip', '…'],
  ['lt', '<'],
  ['mdash', '—'],
  ['nbsp', ' '],
  ['ndash', '–'],
  ['quot', '"'],
])

const PAST_AMPERSAND = 1
const PAST_MARKER = 1
const BEFORE_SEMICOLON = -1
const HEXADECIMAL = 16
const DECIMAL = 10
const HIGHEST_CODE_POINT = 0x10ffff
const NUMBER_SIGN = '#'
const HEX_MARKER = 'x'
const DECIMAL_DIGITS = /^[0-9]+$/v
const HEX_DIGITS = /^[0-9a-f]+$/iv

function fromCodePoint(body: string): string | null {
  if (!body.startsWith(NUMBER_SIGN)) return null

  const after = body.slice(PAST_MARKER)
  const hexadecimal = after.toLowerCase().startsWith(HEX_MARKER)
  const digits = hexadecimal ? after.slice(PAST_MARKER) : after
  if (!(hexadecimal ? HEX_DIGITS : DECIMAL_DIGITS).test(digits)) return null

  const code = Number.parseInt(digits, hexadecimal ? HEXADECIMAL : DECIMAL)

  return code <= HIGHEST_CODE_POINT ? String.fromCodePoint(code) : null
}

export function decodeEntity(raw: string): string {
  const body = raw.slice(PAST_AMPERSAND, BEFORE_SEMICOLON)

  return NAMED.get(body) ?? fromCodePoint(body) ?? raw
}
