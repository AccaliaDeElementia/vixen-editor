'use sanity'

import path from 'node:path'

import { compile } from 'sass'
import { describe, expect, it } from 'vitest'

const TOKENS = path.resolve(import.meta.dirname, '..', '..', 'src', 'styles', '_tokens.scss')

const DARK_BLOCK = /^:root \{(?<body>[^\}]*)\}/mv
const LIGHT_BLOCK = /prefers-color-scheme: light[^\{]*\{\s*:root \{(?<body>[^\}]*)\}/v
const DECLARATION = /--(?<name>[\w\-]+): (?<value>#[0-9a-f]{3,6});/gv

const INK = ['ink-primary', 'ink-success', 'ink-info', 'ink-warning', 'ink-danger', 'ink-heading', 'muted']
const BEHIND_PROSE = ['body-bg', 'surface', 'line-active', 'gutter-active']
const BEHIND_ICONS = ['selected']

const READABLE_TEXT = 4.5
const READABLE_GRAPHIC = 3

const HEX_PAIR = 2
const SHORTHAND_LENGTH = 4
const CHANNEL_MAX = 255
const SRGB_KNEE = 0.03928
const SRGB_SLOPE = 12.92
const SRGB_OFFSET = 0.055
const SRGB_SCALE = 1.055
const SRGB_EXPONENT = 2.4
const RED_WEIGHT = 0.2126
const GREEN_WEIGHT = 0.7152
const BLUE_WEIGHT = 0.0722
const CONTRAST_OFFSET = 0.05

type Palette = Record<string, string>

function expanded(hex: string): string {
  if (hex.length !== SHORTHAND_LENGTH) return hex

  return `#${Array.from(hex.slice(1), (digit) => digit.repeat(HEX_PAIR)).join('')}`
}

function channelsOf(hex: string): number[] {
  const digits = expanded(hex).slice(1)

  return Array.from({ length: digits.length / HEX_PAIR }, (_unused, index) =>
    Number.parseInt(digits.slice(index * HEX_PAIR, index * HEX_PAIR + HEX_PAIR), 16),
  )
}

function luminanceOf(hex: string): number {
  const [red = 0, green = 0, blue = 0] = channelsOf(hex).map((channel) => {
    const scaled = channel / CHANNEL_MAX

    return scaled <= SRGB_KNEE ? scaled / SRGB_SLOPE : ((scaled + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_EXPONENT
  })

  return RED_WEIGHT * red + GREEN_WEIGHT * green + BLUE_WEIGHT * blue
}

function contrastBetween(one: string, other: string): number {
  const [lighter, darker] = [luminanceOf(one), luminanceOf(other)].sort((first, second) => second - first)

  return ((lighter ?? 0) + CONTRAST_OFFSET) / ((darker ?? 0) + CONTRAST_OFFSET)
}

function paletteIn(css: string, block: RegExp): Palette {
  const body = block.exec(css)?.groups?.body ?? ''

  return Object.fromEntries(
    [...body.matchAll(DECLARATION)].map(({ groups }) => [groups?.name ?? '', groups?.value ?? '']),
  )
}

function schemes(): Record<string, Palette> {
  const { css } = compile(TOKENS)

  return { dark: paletteIn(css, DARK_BLOCK), light: paletteIn(css, LIGHT_BLOCK) }
}

function tooFaintIn(behind: readonly string[], floor: number): string[] {
  return Object.entries(schemes()).flatMap(([scheme, palette]) =>
    INK.flatMap((ink) =>
      behind
        .map((surface) => ({ surface, ratio: contrastBetween(palette[ink] ?? '', palette[surface] ?? '') }))
        .filter(({ ratio }) => ratio < floor)
        .map(({ surface, ratio }) => `${scheme}: --${ink} on --${surface} is ${ratio.toFixed(HEX_PAIR)}:1`),
    ),
  )
}

describe('ink against the surfaces its own scheme puts behind it', () => {
  it('carries prose at the ratio the gate asks of text', () => {
    expect(tooFaintIn(BEHIND_PROSE, READABLE_TEXT)).toStrictEqual([])
  })

  it('carries an icon on a selected row at the ratio the gate asks of a graphic', () => {
    expect(tooFaintIn(BEHIND_ICONS, READABLE_GRAPHIC)).toStrictEqual([])
  })
})
