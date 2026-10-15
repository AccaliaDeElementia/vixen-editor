'use sanity'

import { describe, expect, it } from 'vitest'

import { failOnOutput, outputSoFar, watchOutput } from './noise.ts'

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
