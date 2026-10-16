'use sanity'

import path from 'node:path'

import type { Plugin } from 'vite'

const NOTHING_SET = ''
const FIRST_LINE = 1
const FIRST_INDEX = 0
const QUERY = '?'

export interface Mutation {
  file: string
  line: number
  from: string
  to: string
}

export function applyMutation(source: string, { line, from, to }: Mutation): string {
  const lines = source.split('\n')
  const at = line - FIRST_LINE
  if (at < FIRST_INDEX || at >= lines.length) return source

  return lines.map((held, index) => (index === at ? held.replace(from, to) : held)).join('\n')
}

export function mutationIn(env: Record<string, string | undefined>): Mutation | null {
  const file = env.VIXEN_MUTANT_FILE ?? NOTHING_SET
  const line = Number(env.VIXEN_MUTANT_LINE ?? NOTHING_SET)
  const from = env.VIXEN_MUTANT_FROM ?? NOTHING_SET
  if (file === NOTHING_SET || from === NOTHING_SET || !Number.isInteger(line)) return null

  return { file, line, from, to: env.VIXEN_MUTANT_TO ?? NOTHING_SET }
}

export function envFor(mutation: Mutation): Record<string, string> {
  return {
    VIXEN_MUTANT_FILE: mutation.file,
    VIXEN_MUTANT_LINE: String(mutation.line),
    VIXEN_MUTANT_FROM: mutation.from,
    VIXEN_MUTANT_TO: mutation.to,
  }
}

export function mutantPlugins(env: Record<string, string | undefined>): Plugin[] {
  const mutation = mutationIn(env)
  if (mutation === null) return []

  const target = path.resolve(mutation.file)

  return [
    {
      name: 'vixen-mutant',
      enforce: 'pre',
      transform: (code: string, id: string) => {
        const [withoutQuery] = id.split(QUERY)

        return withoutQuery === target ? { code: applyMutation(code, mutation), map: null } : null
      },
    },
  ]
}
