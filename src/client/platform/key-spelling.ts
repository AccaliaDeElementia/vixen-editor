'use sanity'

export type KeyPlatform = 'mac' | 'win' | 'linux' | 'key'

export interface Chord {
  key?: string
  mac?: string
  win?: string
  linux?: string
}

const DESKTOP_TOUCH_POINTS = 2

const PLATFORM_RULES = {
  mac: 'Mac',
  windows: 'Win',
  linux: 'Linux|X11',
  apple: 'Apple Computer',
  mobile: 'Mobile\\/\\w+',
  desktopTouchPoints: DESKTOP_TOUCH_POINTS,
}

const LINUX = new RegExp(PLATFORM_RULES.linux, 'v')
const HANDHELD = new RegExp(PLATFORM_RULES.mobile, 'v')

const NAMED_PLATFORMS: ReadonlyArray<readonly [KeyPlatform, string]> = [
  ['mac', 'macOS'],
  ['win', 'Windows'],
  ['linux', 'Linux'],
]

const PARTS = /-(?!$)/v
const ARROW = /^Arrow(?<direction>Up|Down|Left|Right)$/v
const SINGLE_LETTER = /^\p{Letter}$/v
const TYPED_WITH_SHIFT = /^\p{Uppercase_Letter}$/v

const LAST_PART = -1
const FIRST_PART = 0

const CMD_PART = /^(?:cmd|meta|m)$/iv
const CTRL_PART = /^(?:c|ctrl|control)$/iv
const ALT_PART = /^a(?:lt)?$/iv
const SHIFT_PART = /^s(?:hift)?$/iv

const SHIFT = 'Shift'
const ALT = 'Alt'
const CMD = 'Cmd'
const CTRL = 'Ctrl'
const EITHER_MODIFIER = 'Ctrl/Cmd'
const META = 'Meta'
const CONTROL = 'Control'
const MODIFIER_ORDER = [CMD, EITHER_MODIFIER, CTRL, ALT, SHIFT]
const ARIA_ORDER = [META, CONTROL, ALT, SHIFT]

const SPACE = ' '
const JOINER = ' + '
const EITHER = ' or '
const ALSO = ' and '
const ARIA_JOINER = '+'
const ARIA_EITHER = ' '

const UNKNOWN_PLATFORM: KeyPlatform = 'key'
const WHERE_UNKNOWN: readonly KeyPlatform[] = ['win', 'mac']

interface Agent {
  platform: string
  userAgent: string
  vendor: string
  maxTouchPoints: number
}

export function platformOf(agent: Agent): KeyPlatform {
  const handheld =
    agent.vendor.includes(PLATFORM_RULES.apple) &&
    (HANDHELD.test(agent.userAgent) || agent.maxTouchPoints > PLATFORM_RULES.desktopTouchPoints)

  if (handheld || agent.platform.includes(PLATFORM_RULES.mac)) return 'mac'
  if (agent.platform.includes(PLATFORM_RULES.windows)) return 'win'
  if (LINUX.test(agent.platform)) return 'linux'

  return 'key'
}

export function spellingsFor(chords: readonly Chord[], platform: KeyPlatform): string[] {
  return chords.flatMap((chord) => chord[platform] ?? chord.key ?? [])
}

function modifierNamed(part: string, platform: KeyPlatform): string {
  if (CMD_PART.test(part)) return CMD
  if (CTRL_PART.test(part)) return CTRL
  if (ALT_PART.test(part)) return ALT
  if (SHIFT_PART.test(part)) return SHIFT

  return platform === 'mac' ? CMD : platform === UNKNOWN_PLATFORM ? EITHER_MODIFIER : CTRL
}

function ariaModifierNamed(part: string, platform: KeyPlatform): string {
  if (CMD_PART.test(part)) return META
  if (CTRL_PART.test(part)) return CONTROL
  if (ALT_PART.test(part)) return ALT
  if (SHIFT_PART.test(part)) return SHIFT

  return platform === 'mac' ? META : CONTROL
}

function keyNamed(part: string): string {
  if (part === SPACE) return 'Space'

  return SINGLE_LETTER.test(part) ? part.toUpperCase() : part
}

function baseNamed(part: string): string {
  const arrow = ARROW.exec(part)?.groups?.direction

  return arrow === undefined ? keyNamed(part) : `${arrow} arrow`
}

interface Vocabulary {
  modifierNamed: (part: string, platform: KeyPlatform) => string
  order: readonly string[]
  baseNamed: (part: string) => string
  joiner: string
}

const ON_SCREEN: Vocabulary = { modifierNamed, order: MODIFIER_ORDER, baseNamed, joiner: JOINER }
const IN_ARIA: Vocabulary = {
  modifierNamed: ariaModifierNamed,
  order: ARIA_ORDER,
  baseNamed: keyNamed,
  joiner: ARIA_JOINER,
}

function spelledIn(vocabulary: Vocabulary, spelling: string, platform: KeyPlatform): string {
  const parts = spelling.split(PARTS)
  const base = parts.slice(LAST_PART)
  const held = parts.slice(FIRST_PART, LAST_PART).map((part) => vocabulary.modifierNamed(part, platform))
  const modifiers = [...held, ...base.flatMap((part) => (TYPED_WITH_SHIFT.test(part) ? [SHIFT] : []))]
  const ordered = vocabulary.order.filter((name) => modifiers.includes(name))

  return [...ordered, ...base.map(vocabulary.baseNamed)].join(vocabulary.joiner)
}

function nameOfKey(spelling: string, platform: KeyPlatform): string {
  return spelledIn(ON_SCREEN, spelling, platform)
}

export function ariaKeysFor(chords: readonly Chord[], platform: KeyPlatform): string {
  const hosts = platform === UNKNOWN_PLATFORM ? WHERE_UNKNOWN : [platform]
  const spelled = hosts.flatMap((host) =>
    spellingsFor(chords, host).map((spelling) => spelledIn(IN_ARIA, spelling, host)),
  )

  return [...new Set(spelled)].join(ARIA_EITHER)
}

export function nameOfChords(chords: readonly Chord[], platform: KeyPlatform): string {
  return spellingsFor(chords, platform)
    .map((spelling) => nameOfKey(spelling, platform))
    .join(EITHER)
}

function platformsByName(chords: readonly Chord[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>()

  for (const [platform, named] of NAMED_PLATFORMS) {
    const spelled = nameOfChords(chords, platform)
    grouped.set(spelled, [...(grouped.get(spelled) ?? []), named])
  }

  return grouped
}

export function neutralNameOf(chords: readonly Chord[]): string {
  const everywhere = spellingsFor(chords, 'key').join(EITHER)
  const alike = NAMED_PLATFORMS.every(([platform]) => spellingsFor(chords, platform).join(EITHER) === everywhere)
  if (alike) return nameOfChords(chords, 'key')

  return [...platformsByName(chords)].map(([spelled, named]) => `${spelled} on ${named.join(ALSO)}`).join(', ')
}

export const TestOnly = { PLATFORM_RULES, nameOfKey }
