'use sanity'

import { expect } from 'vitest'

import { cast } from './cast.ts'

const NOTHING = ''
const ONLY_THE_RUNNER_WRITES = 'only the test runner may write to stdout or stderr'

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

export function outputSoFar(): Record<string, string> {
  const seen = Object.fromEntries(written)
  written.clear()

  return seen
}

export function failOnOutput(): void {
  expect(outputSoFar(), ONLY_THE_RUNNER_WRITES).toStrictEqual({})
}
