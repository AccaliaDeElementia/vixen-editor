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

const SHIFT = 'Shift'
const MODIFIER_ORDER = ['Cmd', 'Ctrl/Cmd', 'Ctrl', 'Alt', SHIFT]

const SPACE = ' '
const JOINER = ' + '
const EITHER = ' or '
const ALSO = ' and '

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
  if (/^(?:cmd|meta|m)$/iv.test(part)) return 'Cmd'
  if (/^(?:c|ctrl|control)$/iv.test(part)) return 'Ctrl'
  if (/^a(?:lt)?$/iv.test(part)) return 'Alt'
  if (/^s(?:hift)?$/iv.test(part)) return 'Shift'

  return platform === 'mac' ? 'Cmd' : platform === 'key' ? 'Ctrl/Cmd' : 'Ctrl'
}

function baseNamed(part: string): string {
  if (part === SPACE) return 'Space'
  const arrow = ARROW.exec(part)?.groups?.direction

  return arrow === undefined ? (SINGLE_LETTER.test(part) ? part.toUpperCase() : part) : `${arrow} arrow`
}

function nameOfKey(spelling: string, platform: KeyPlatform): string {
  const parts = spelling.split(PARTS)
  const base = parts.slice(LAST_PART)
  const held = parts.slice(FIRST_PART, LAST_PART).map((part) => modifierNamed(part, platform))
  const modifiers = [...held, ...base.flatMap((part) => (TYPED_WITH_SHIFT.test(part) ? [SHIFT] : []))]
  const ordered = MODIFIER_ORDER.filter((name) => modifiers.includes(name))

  return [...ordered, ...base.map(baseNamed)].join(JOINER)
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
