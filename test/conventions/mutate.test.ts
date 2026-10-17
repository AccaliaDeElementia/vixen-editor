'use sanity'

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { run, TestOnly, type Sandbox } from '../../tools/mutate.ts'

const { argsFor, fateOf, lineHolding, summaryOf } = TestOnly

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

function neverFinishing(into: Signalled[]): Sandbox {
  return { spawn: () => ({ pid: CHILD_PID }), kill: recordingKill(into) }
}

function finishingAtOnce(into: Signalled[]): Sandbox {
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

    await run(COMMAND, NO_ARGUMENTS, BRIEFLY_MS, { sandbox: neverFinishing(signalled) })

    expect(signalled).toStrictEqual([{ pid: WHOLE_GROUP, signal: 'SIGKILL' }])
  })

  it('settles rather than waiting on a child that will never call back', async () => {
    const ran = await run(COMMAND, NO_ARGUMENTS, BRIEFLY_MS, { sandbox: neverFinishing([]) })

    expect(ran.timedOut).toBe(true)
  })

  it('signals nothing when the child finishes within the bound', async () => {
    const signalled: Signalled[] = []

    await run(COMMAND, NO_ARGUMENTS, BRIEFLY_MS, { sandbox: finishingAtOnce(signalled) })

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

describe('what a mutant is run against', () => {
  it('runs only the tests related to the file it mutates', () => {
    expect(argsFor(A_MUTANT)).toContain('related')
  })

  it('names that file, so the related set is computed from it', () => {
    expect(argsFor(A_MUTANT)).toContain(A_MUTANT.file)
  })

  it('stops at the first failure, because one dead test is the whole answer', () => {
    expect(argsFor(A_MUTANT)).toContain('--bail=1')
  })
})

describe('finding the line a case names', () => {
  it('counts from one, so it names the line a reader would', () => {
    expect(lineHolding(['first', 'const a = 1 === 1'].join('\n'), '===')).toBe(2)
  })

  it('takes the first line holding the text, which is the one a case means', () => {
    expect(lineHolding(['a === b', 'c === d'].join('\n'), '===')).toBe(1)
  })
})

describe('what the tool does to the tree', () => {
  it('reads source files and writes none, so a sweep cannot leave a mutant on disk', async () => {
    const source = await readFile('tools/mutate.ts', 'utf8')

    expect({ reads: source.includes('readFile'), writes: source.includes('writeFile') }).toStrictEqual({
      reads: true,
      writes: false,
    })
  })
})
