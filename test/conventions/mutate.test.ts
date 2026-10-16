'use sanity'

import { describe, expect, it } from 'vitest'

import { TestOnly } from '../../tools/mutate.ts'

const { fateOf, run, summaryOf } = TestOnly

const CHILD_PID = 4321
const WHOLE_GROUP = -CHILD_PID
const BRIEFLY_MS = 20
const COMMAND = 'npx'
const NO_ARGUMENTS: string[] = []
const FINISHED_WELL = null
const SOME_OUTPUT = 'ok'
const OVER_A_PIPE_BUFFER = 200_000
const LONG_ENOUGH_MS = 2000

interface Signalled {
  pid: number
  signal: NodeJS.Signals
}

function recordingKill(into: Signalled[]): (pid: number, signal: NodeJS.Signals) => void {
  return (pid, signal) => {
    into.push({ pid, signal })
  }
}

function neverFinishing(into: Signalled[]): Parameters<typeof run>[3] {
  return { spawn: () => ({ pid: CHILD_PID }), kill: recordingKill(into) }
}

function finishingAtOnce(into: Signalled[]): Parameters<typeof run>[3] {
  return {
    spawn: (_command, _args, done) => {
      done(FINISHED_WELL, SOME_OUTPUT)

      return { pid: CHILD_PID }
    },
    kill: recordingKill(into),
  }
}

describe('bounding a mutant run', () => {
  it('ends the whole process group, not only the child it spawned', async () => {
    const signalled: Signalled[] = []

    await run(COMMAND, NO_ARGUMENTS, BRIEFLY_MS, neverFinishing(signalled))

    expect(signalled).toStrictEqual([{ pid: WHOLE_GROUP, signal: 'SIGKILL' }])
  })

  it('settles rather than waiting on a child that will never call back', async () => {
    const ran = await run(COMMAND, NO_ARGUMENTS, BRIEFLY_MS, neverFinishing([]))

    expect(ran.timedOut).toBe(true)
  })

  it('signals nothing when the child finishes within the bound', async () => {
    const signalled: Signalled[] = []

    await run(COMMAND, NO_ARGUMENTS, BRIEFLY_MS, finishingAtOnce(signalled))

    expect(signalled).toStrictEqual([])
  })
})

describe('reading what a mutant run writes', () => {
  it('drains stderr, because a pipe nobody reads stops the child once it fills', async () => {
    const writes = `process.stderr.write('x'.repeat(${String(OVER_A_PIPE_BUFFER)}))`

    const ran = await run('node', ['-e', writes], LONG_ENOUGH_MS)

    expect(ran.timedOut).toBe(false)
  })

  it('reports what the child wrote to stdout, which is where the test summary lands', async () => {
    const ran = await run('node', ['-e', "process.stdout.write('Tests 1 passed')"], LONG_ENOUGH_MS)

    expect(ran.stdout).toBe('Tests 1 passed')
  })

  it('keeps stderr out of that, so a banner on the other stream cannot be read as the summary', async () => {
    const both = "process.stderr.write('Tests 157 ----');process.stdout.write('Tests 157 failed | 2 passed')"

    const ran = await run('node', ['-e', both], LONG_ENOUGH_MS)

    expect(ran.stdout).toBe('Tests 157 failed | 2 passed')
  })
})

const A_MUTANT = { file: 'src/a.ts', line: 7, from: '===', to: '!==', source: '' }
const ANOTHER_MUTANT = { ...A_MUTANT, line: 9 }
const NO_OUTPUT_AT_ALL = ''

describe('what a run proves about a mutant', () => {
  it('reads a timeout as unresolved, because a run that never finished proved nothing', () => {
    expect(fateOf({ stdout: NO_OUTPUT_AT_ALL, failed: true, timedOut: true })).toBe('unresolved')
  })

  it('reads a failing run as killed', () => {
    expect(fateOf({ stdout: NO_OUTPUT_AT_ALL, failed: true, timedOut: false })).toBe('killed')
  })

  it('reads a passing run as survived', () => {
    expect(fateOf({ stdout: NO_OUTPUT_AT_ALL, failed: false, timedOut: false })).toBe('survived')
  })
})

describe('reporting a sweep', () => {
  it('counts an unresolved mutant apart from the killed', () => {
    const outcomes = [
      { mutant: A_MUTANT, fate: 'killed' as const },
      { mutant: ANOTHER_MUTANT, fate: 'unresolved' as const },
    ]

    expect(summaryOf(outcomes)).toContain('1 unresolved of 2')
  })

  it('leaves an unresolved mutant out of the survivors, so the score cannot be inflated', () => {
    const outcomes = [{ mutant: A_MUTANT, fate: 'unresolved' as const }]

    expect(summaryOf(outcomes)).toContain('0 survived of 1')
  })

  it('says nothing of unresolved mutants when a sweep had none', () => {
    const outcomes = [{ mutant: A_MUTANT, fate: 'killed' as const }]

    expect(summaryOf(outcomes).join('\n')).not.toContain('unresolved')
  })
})
