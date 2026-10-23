'use sanity'

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { judge, mutantsFor, run, TestOnly, type Sandbox } from '../../tools/mutate.ts'

const { concurrencyFor, fateOf, lineHolding, mirrorArgsFor, summaryOf } = TestOnly

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

const A_MUTANT = { file: 'src/a.ts', line: 7, from: '===', to: '!==', expected: 'killed' as const }
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

describe('the test named for the module under the mutant', () => {
  const SOMEWHERE = {
    file: 'src/client/platform/toast.ts',
    line: 1,
    from: '===',
    to: '!==',
    expected: 'killed' as const,
  }

  function failingWhen(into: string[][], match: string): Sandbox {
    return {
      spawn: (_command, args, done) => {
        into.push(args)
        done(args.some((argument) => argument.includes(match)) ? new Error('dead') : FINISHED_WELL, SOME_OUTPUT)

        return { pid: CHILD_PID }
      },
      kill: () => undefined,
    }
  }

  it('names the mirror of the module, which the project guarantees exists', () => {
    expect(mirrorArgsFor(SOMEWHERE)).toContain('test/client/platform/toast')
  })

  it('passes with no tests, so a module without a mirror falls through rather than reading as killed', () => {
    expect(mirrorArgsFor(SOMEWHERE)).toContain('--passWithNoTests')
  })

  it('asks its own test and nothing else, so every behaviour is pinned where it is owned', async () => {
    const calls: string[][] = []

    await judge(SOMEWHERE, LONG_ENOUGH_MS, { sandbox: failingWhen(calls, 'never matches') })

    expect(calls).toHaveLength(1)
  })

  it('stops at the first failure, because one dead test is the whole answer', () => {
    expect(mirrorArgsFor(SOMEWHERE)).toContain('--bail=1')
  })

  it('reports the kill its own test made', async () => {
    const outcome = await judge(SOMEWHERE, LONG_ENOUGH_MS, {
      sandbox: failingWhen([], 'test/client/platform/toast'),
    })

    expect(outcome.fate).toBe('killed')
  })

  it('leaves a mutant its own test did not kill as a survivor, whatever another test would have done', async () => {
    const outcome = await judge(SOMEWHERE, LONG_ENOUGH_MS, { sandbox: failingWhen([], 'never matches') })

    expect(outcome.fate).toBe('survived')
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

const EXPECTED_TO_SURVIVE = ['/* mutation-ignore >= -- a stable sort cannot tell them apart */', 'a > b ? x : y'].join(
  '\n',
)

describe('prose that reads like code', () => {
  it('is left alone inside a block comment, however far from the opening line', () => {
    const source = ['/* a note mentioning true, and', '   a === b on a later line */', 'const x = 1'].join('\n')

    expect(mutantsFor('src/a.ts', source)).toStrictEqual([])
  })

  it('is mutated outside one, so that scan is not simply blind to the words', () => {
    expect(mutantsFor('src/a.ts', 'const x = true').map((mutant) => mutant.to)).toStrictEqual(['false'])
  })

  it('does not take a path holding a star for the start of a comment', () => {
    expect(mutantsFor('src/a.ts', ["const route = '/assets/*'", 'const x = true'].join('\n'))).toHaveLength(1)
  })
})

describe('a type the compiler erases', () => {
  it('yields no mutant, because changing a type is a compile error or nothing at all', () => {
    expect(mutantsFor('src/a.ts', 'type Outcome = { ok: true } | { ok: false }')).toStrictEqual([])
  })

  it('is mutated where the same words are a value, so the scan is not simply blind to them', () => {
    expect(mutantsFor('src/a.ts', 'const outcome = { ok: true }')).toHaveLength(1)
  })

  it('reads an exported declaration the same way as a local one', () => {
    expect(mutantsFor('src/a.ts', 'export type Outcome = { ok: true }')).toStrictEqual([])
  })

  it('follows a union onto the lines below it, which carry no mark of their own', () => {
    const source = ['type Outcome =', '  | { ok: true }', '  | { ok: false }'].join('\n')

    expect(mutantsFor('src/a.ts', source)).toStrictEqual([])
  })

  it('follows a braced declaration to its closing line', () => {
    const source = ['type Outcome = {', '  ok: true', '}'].join('\n')

    expect(mutantsFor('src/a.ts', source)).toStrictEqual([])
  })

  it('releases the line after one, so the code below a type is still measured', () => {
    const source = ['type Outcome = {', '  ok: true', '}', 'const x = true'].join('\n')

    expect(mutantsFor('src/a.ts', source)).toHaveLength(1)
  })

  it('releases the line after a blank one, which is how a real file separates them', () => {
    const source = ['type Outcome = { ok: true }', '', 'const x = true'].join('\n')

    expect(mutantsFor('src/a.ts', source)).toHaveLength(1)
  })

  it('leaves a value named type alone, which declares nothing', () => {
    expect(mutantsFor('src/a.ts', 'type = true').map((mutant) => mutant.to)).toStrictEqual(['false'])
  })

  it('releases the line after a union, which ends without a brace to close', () => {
    const source = ['type Outcome =', '  | { ok: true }', '  | { ok: false }', 'const x = true'].join('\n')

    expect(mutantsFor('src/a.ts', source)).toHaveLength(1)
  })
})

describe('a mutant a comment says should survive', () => {
  it('is expected to survive, so the sweep checks the claim rather than skipping it', () => {
    expect(mutantsFor('src/a.ts', EXPECTED_TO_SURVIVE).map((mutant) => mutant.expected)).toStrictEqual(['survived'])
  })

  it('is expected to die when nothing says otherwise', () => {
    expect(mutantsFor('src/a.ts', 'a > b ? x : y').map((mutant) => mutant.expected)).toStrictEqual(['killed'])
  })

  it('refuses a line carrying more than one mutable operation, which it could not tell apart', () => {
    const ambiguous = ['/* mutation-ignore >= -- why */', 'a > b && c === d'].join('\n')

    expect(() => mutantsFor('src/a.ts', ambiguous)).toThrow(/one mutable operation/v)
  })

  it('refuses a marker naming a change that line does not make, so a stale marker cannot hide', () => {
    const wrong = ['/* mutation-ignore !== -- why */', 'a > b ? x : y'].join('\n')

    expect(() => mutantsFor('src/a.ts', wrong)).toThrow(/does not make/v)
  })

  it('names the file and line it refused, because a sweep stops there', () => {
    const ambiguous = ['/* mutation-ignore >= -- why */', 'a > b && c === d'].join('\n')

    expect(() => mutantsFor('src/a.ts', ambiguous)).toThrow(/src\/a\.ts:2/v)
  })
})

describe('reporting a claim that has expired', () => {
  it('names a mutant that was expected to survive and died, because the reason has stopped being true', () => {
    const outcomes = [{ mutant: { ...A_MUTANT, expected: 'survived' as const }, fate: 'killed' as const }]

    expect(summaryOf(outcomes)).toContain('1 expired of 1')
  })

  it('says nothing of expired claims when none were made', () => {
    const outcomes = [{ mutant: A_MUTANT, fate: 'killed' as const }]

    expect(summaryOf(outcomes).join('\n')).not.toContain('expired')
  })
})

describe('how many mutants a sweep judges at once', () => {
  const PLENTY = 32
  const NOTHING_ASKED = undefined

  it('judges several at once on a machine with cores to spare', () => {
    expect(concurrencyFor(PLENTY, NOTHING_ASKED)).toBeGreaterThan(1)
  })

  it('asks for no more than the cores there are, so a small machine is not oversubscribed', () => {
    expect(concurrencyFor(2, NOTHING_ASKED)).toBe(2)
  })

  it('stops climbing past the point where more stopped buying wall time', () => {
    expect(concurrencyFor(PLENTY, NOTHING_ASKED)).toBe(concurrencyFor(PLENTY * 4, NOTHING_ASKED))
  })

  it('judges one at a time where there is only one core', () => {
    expect(concurrencyFor(1, NOTHING_ASKED)).toBe(1)
  })

  it('takes the width the caller asked for, which is how the ceiling gets measured again', () => {
    expect(concurrencyFor(PLENTY, '24')).toBe(24)
  })

  it('refuses a width below one, which would judge nothing at all', () => {
    expect(concurrencyFor(PLENTY, '0')).toBe(1)
  })

  it('ignores a width that is not a number', () => {
    expect(concurrencyFor(2, 'wide')).toBe(2)
  })
})
