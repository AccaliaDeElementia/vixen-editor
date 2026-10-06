'use sanity'

import { describe, expect, it } from 'vitest'

import { TestOnly } from '../../tools/mutate.ts'

const { run } = TestOnly

const CHILD_PID = 4321
const WHOLE_GROUP = -CHILD_PID
const BRIEFLY_MS = 20
const COMMAND = 'npx'
const NO_ARGUMENTS: string[] = []
const FINISHED_WELL = null
const SOME_OUTPUT = 'ok'

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
