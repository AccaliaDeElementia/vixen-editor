'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { given } from '../../conditions.ts'

import type { Dialogs } from '../../../src/client/files/dialogs.ts'
import { createStaleBuild, TestOnly } from '../../../src/client/editor/stale-build.ts'
import { cast } from '../../cast.ts'
import { page } from '../editor-fixtures.ts'

const { CARRY_ON, RELOAD_NOW, SAVE_AND_RELOAD } = TestOnly

let root: HTMLElement = document.createElement('div')
let said: string[] = []

interface Offered {
  value: string
  tone?: string
}

let offered: readonly Offered[] = []

function dialogsAnswering(...answers: Array<string | null>): { dialogs: Dialogs; asked: () => number } {
  let asked = 0

  return {
    asked: () => asked,
    dialogs: cast<Dialogs>({
      choose: ({ choices }: { choices: readonly Offered[] }) => {
        offered = choices
        const { [asked]: answer } = answers
        asked += 1

        return Promise.resolve(answer ?? CARRY_ON)
      },
    }),
  }
}

function warning(): HTMLElement | null {
  return root.querySelector<HTMLElement>('#stale-build')
}

function noticing(dialogs: Dialogs, reload: () => void, saved = true): { noticed: () => Promise<void> } {
  return createStaleBuild({
    root,
    dialogs,
    reload,
    announce: (text: string) => {
      said.push(text)
    },
    saveEverything: () => Promise.resolve(saved),
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  root = page()
  said = []
  offered = []
})

describe('a page the server has moved on from', () => {
  it('reloads when the reader asks for that', async () => {
    const reload = vi.fn<() => void>()

    await noticing(dialogsAnswering(RELOAD_NOW).dialogs, reload).noticed()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('saves before reloading when the reader asks for their work to be kept', async () => {
    const reload = vi.fn<() => void>()

    await noticing(dialogsAnswering(SAVE_AND_RELOAD).dialogs, reload).noticed()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload over unsaved work when the save is refused', async () => {
    const reload = vi.fn<() => void>()

    await noticing(dialogsAnswering(SAVE_AND_RELOAD, CARRY_ON).dialogs, reload, false).noticed()

    expect(reload).not.toHaveBeenCalled()
  })

  it('says why, when the save it offered could not be made', async () => {
    await noticing(dialogsAnswering(SAVE_AND_RELOAD, CARRY_ON).dialogs, vi.fn<() => void>(), false).noticed()

    expect(said).toContain('Your work could not be saved, so the page was left as it is')
  })

  it('asks again rather than closing over work it could not save', async () => {
    const answering = dialogsAnswering(SAVE_AND_RELOAD, CARRY_ON)

    await noticing(answering.dialogs, vi.fn<() => void>(), false).noticed()

    expect(answering.asked()).toBe(2)
  })

  it('leaves a warning in the ribbon when the reader carries on', async () => {
    await noticing(dialogsAnswering(CARRY_ON).dialogs, vi.fn<() => void>()).noticed()

    expect(warning()?.hidden).toBe(false)
  })

  it('keeps the warning out of the way until a mismatch is found', () => {
    noticing(dialogsAnswering(CARRY_ON).dialogs, vi.fn<() => void>())

    expect(warning()?.hidden).toBe(true)
  })

  it('brings the choice back when the warning is clicked, so it is not final', async () => {
    const answering = dialogsAnswering(CARRY_ON, CARRY_ON)
    await noticing(answering.dialogs, vi.fn<() => void>()).noticed()

    warning()?.click()
    await Promise.resolve()

    expect(answering.asked()).toBe(2)
  })

  it('still lets the reader carry on where the page has no ribbon to mark', async () => {
    root = document.createElement('div')

    await noticing(dialogsAnswering(CARRY_ON).dialogs, vi.fn<() => void>()).noticed()

    expect(warning()).toBeNull()
  })
})

describe('the warning the reader is left with', () => {
  it('is spoken as well as shown, since a rail changing is no use to a screen reader', async () => {
    const { dialogs } = dialogsAnswering(CARRY_ON)

    await noticing(dialogs, vi.fn<() => void>()).noticed()

    expect(said).toStrictEqual([warning()?.getAttribute('aria-label')])
  })

  it('names the page out of date itself when the rail carries no label to borrow', async () => {
    given(() => {
      warning()?.removeAttribute('aria-label')
    })

    await noticing(dialogsAnswering(CARRY_ON).dialogs, vi.fn<() => void>()).noticed()

    expect(said).toStrictEqual(['This page is out of date'])
  })

  it('is spoken once, not again each time the reader declines', async () => {
    const { dialogs } = dialogsAnswering(CARRY_ON, CARRY_ON)
    const stale = noticing(dialogs, vi.fn<() => void>())
    await stale.noticed()

    await stale.noticed()

    expect(said.length).toBe(1)
  })
})

describe('the three courses the warning offers', () => {
  async function asked(): Promise<void> {
    await noticing(dialogsAnswering(CARRY_ON).dialogs, vi.fn<() => void>()).noticed()
  }

  function toneOf(value: string): string | undefined {
    return offered.find((choice) => choice.value === value)?.tone
  }

  it('marks staying without saving as the one to be careful about', async () => {
    await asked()

    expect(toneOf(CARRY_ON)).toBe('warning')
  })

  it('marks saving and reloading as the one that loses nothing', async () => {
    await asked()

    expect(toneOf(SAVE_AND_RELOAD)).toBe('success')
  })

  it('leaves a plain reload looking like any other choice', async () => {
    await asked()

    expect(toneOf(RELOAD_NOW)).toBeUndefined()
  })
})
