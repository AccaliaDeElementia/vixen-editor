'use sanity'

import { describe, expect, it } from 'vitest'

import { failOnOutput, outputSoFar, watchConsole, watchOutput, type Speaker } from './noise.ts'

function recording(): Stream & { seen: string[] } {
  const seen: string[] = []

  return {
    seen,
    write: (chunk: unknown) => {
      seen.push(String(chunk))

      return true
    },
  }
}

interface Stream {
  write: (chunk: unknown) => boolean
}

describe('watching what a test writes', () => {
  it('fails the test that wrote to stdout', () => {
    const stdout = recording()
    watchOutput({ stdout })
    stdout.write('chatter')

    expect(() => {
      failOnOutput()
    }).toThrow()
  })

  it('fails the test that wrote to stderr', () => {
    const stderr = recording()
    watchOutput({ stderr })
    stderr.write('a refusal nobody threw')

    expect(() => {
      failOnOutput()
    }).toThrow()
  })

  it('says which stream it was, so the search starts somewhere', () => {
    const stderr = recording()
    watchOutput({ stderr })
    stderr.write('trace')

    expect(outputSoFar()).toStrictEqual({ stderr: 'trace' })
  })

  it('leaves a test that wrote nothing alone', () => {
    watchOutput({ stdout: recording() })

    expect(() => {
      failOnOutput()
    }).not.toThrow()
  })

  it('passes the write on, so the stream is guarded rather than muted', () => {
    const stdout = recording()
    watchOutput({ stdout })
    stdout.write('kept')
    outputSoFar()

    expect(stdout.seen).toStrictEqual(['kept'])
  })
})

describe('watching what a test says through the console', () => {
  function speaking(): Speaker & { seen: string[] } {
    const seen: string[] = []
    const say = (...args: unknown[]): void => {
      seen.push(args.join(' '))
    }

    return { seen, log: say, info: say, warn: say, error: say, debug: say, trace: say }
  }

  it('fails the test whose dependency complained, which no stream guard can see', () => {
    const said = speaking()
    watchConsole(said)
    said.error('a dependency complaining')

    expect(() => {
      failOnOutput()
    }).toThrow()
  })

  it('names the method it came through, so the search starts somewhere', () => {
    const said = speaking()
    watchConsole(said)
    said.warn('deprecated')

    expect(outputSoFar()).toStrictEqual({ 'console.warn': 'deprecated' })
  })

  it('keeps every argument, so the failure says what was said and not only that something was', () => {
    const spoken = speaking()
    watchConsole(spoken)
    spoken.error('refused', { times: 3 })

    expect(outputSoFar()).toStrictEqual({ 'console.error': 'refused {"times":3}' })
  })

  it('survives an argument that refers to itself, rather than failing every test that follows', () => {
    const spoken = speaking()
    const loop: Record<string, unknown> = {}
    loop.self = loop
    watchConsole(spoken)
    spoken.error(loop)

    expect(outputSoFar()).toStrictEqual({ 'console.error': '[an argument JSON could not take]' })
  })

  it('passes the call on, so the console is guarded rather than muted', () => {
    const said = speaking()
    watchConsole(said)
    said.log('kept')
    outputSoFar()

    expect(said.seen).toStrictEqual(['kept'])
  })

  it('leaves a test that said nothing alone', () => {
    watchConsole(speaking())

    expect(() => {
      failOnOutput()
    }).not.toThrow()
  })
})
