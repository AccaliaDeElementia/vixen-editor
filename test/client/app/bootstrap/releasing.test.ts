'use sanity'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TestOnly } from '../../../../src/client/app/bootstrap.ts'
import {
  closeEditors,
  dialogsDismissing,
  filesAnsweringEmpty,
  page,
  recorded,
  sessionRecording,
  trackEditor,
  type Recorded,
} from '../../editor-fixtures.ts'

const { bootstrap } = TestOnly
const NOTHING_LEFT: string[] = []
const NOT_HELD = 0
const ONE_MORE = 1
const NO_IDENTITY = 0

type Listener = EventListenerOrEventListenerObject | null
type Options = AddEventListenerOptions | boolean | undefined

interface Counted {
  root: HTMLElement
  standing: () => string[]
}

function countingPage(): Counted {
  const root = page()
  const held = new Map<string, number>()
  const identities = new WeakMap<object, number>()
  let issued = NO_IDENTITY

  function keyFor(type: string, listener: Listener): string {
    if (listener === null) return `${type}:none`
    let identity = identities.get(listener)
    if (identity === undefined) {
      issued += ONE_MORE
      identity = issued
      identities.set(listener, identity)
    }

    return `${type}:${String(identity)}`
  }

  const target: EventTarget = root
  const add = target.addEventListener.bind(target)
  const remove = target.removeEventListener.bind(target)

  Object.defineProperty(root, 'addEventListener', {
    value: (type: string, listener: Listener, options?: Options) => {
      const key = keyFor(type, listener)
      held.set(key, (held.get(key) ?? NOT_HELD) + ONE_MORE)
      add(type, listener, options)
    },
  })
  Object.defineProperty(root, 'removeEventListener', {
    value: (type: string, listener: Listener, options?: Options) => {
      const key = keyFor(type, listener)
      const outstanding = (held.get(key) ?? NOT_HELD) - ONE_MORE
      if (outstanding > NOT_HELD) held.set(key, outstanding)
      else held.delete(key)
      remove(type, listener, options)
    },
  })

  return { root, standing: () => [...held.keys()].map((key) => key.split(':')[0] ?? '').sort() }
}

let record: Recorded = recorded()

function started(root: HTMLElement): Parameters<typeof bootstrap>[0] {
  return {
    root,
    pathname: '/doc/notes.md',
    session: sessionRecording(record),
    files: filesAnsweringEmpty(),
    dialogs: dialogsDismissing(),
  }
}

beforeEach(() => {
  record = recorded()
})

afterEach(() => {
  closeEditors()
  document.body.innerHTML = ''
})

describe('an editor torn down', () => {
  it('leaves nothing listening on the root it was given', async () => {
    const counted = countingPage()
    const editor = await bootstrap(started(counted.root))

    editor.teardownEditor()

    expect(counted.standing()).toStrictEqual(NOTHING_LEFT)
  })

  it('was listening on that root to begin with, so the count above is not reading nothing', async () => {
    const counted = countingPage()
    trackEditor(await bootstrap(started(counted.root)))

    expect(counted.standing().length).toBeGreaterThan(0)
  })
})
