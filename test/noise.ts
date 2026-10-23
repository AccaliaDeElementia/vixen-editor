'use sanity'

import { expect } from 'vitest'

import { cast } from './cast.ts'

const NOTHING = ''
const ONLY_THE_RUNNER_WRITES = 'only the test runner may write output'

const NOT_JSON = '[an argument JSON could not take]'

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const

type Saying = (...args: unknown[]) => void

export type Speaker = Record<(typeof CONSOLE_METHODS)[number], Saying>

function readable(value: unknown): string {
  if (typeof value !== 'object' || value === null) return String(value)

  try {
    return JSON.stringify(value)
  } catch {
    return NOT_JSON
  }
}

function said(args: readonly unknown[]): string {
  return args.map(readable).join(' ')
}

type Write = (chunk: unknown, encoding?: unknown, done?: unknown) => boolean

interface Stream {
  write: Write
}

type Streams = Record<string, Stream>

const written = new Map<string, string>()

function watch(name: string, stream: Stream): void {
  const watched = stream
  const passes = watched.write.bind(watched)

  watched.write = (chunk: unknown, encoding?: unknown, done?: unknown): boolean => {
    written.set(name, (written.get(name) ?? NOTHING) + String(chunk))

    return passes(chunk, encoding, done)
  }
}

interface Runtime {
  stdout: Stream
  stderr: Stream
}

function streamsOfThisRuntime(): Streams {
  const { stdout, stderr } = cast<Runtime>(Reflect.get(globalThis, 'process'))

  return { stdout, stderr }
}

export function watchOutput(streams: Streams = streamsOfThisRuntime()): void {
  for (const [name, stream] of Object.entries(streams)) watch(name, stream)
}

export function watchConsole(speaking: Speaker = cast<Speaker>(Reflect.get(globalThis, 'console'))): void {
  const wired = speaking

  for (const method of CONSOLE_METHODS) {
    const passes = wired[method].bind(wired)

    wired[method] = (...args: unknown[]): void => {
      const named = `console.${method}`
      written.set(named, (written.get(named) ?? NOTHING) + said(args))
      passes(...args)
    }
  }
}

export function outputSoFar(): Record<string, string> {
  const seen = Object.fromEntries(written)
  written.clear()

  return seen
}

export function failOnOutput(): void {
  expect(outputSoFar(), ONLY_THE_RUNNER_WRITES).toStrictEqual({})
}
