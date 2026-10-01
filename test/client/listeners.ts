'use sanity'

import { expect } from 'vitest'

const NOTHING_STANDING: string[] = []

const LEAKED_LISTENER =
  'This test finished with a listener still registered on window or document. Both are shared by every test in the file, so the handler goes on firing against a subject this test has abandoned. Hold the remover whatever registered it handed back and call it.'

type Listener = EventListenerOrEventListenerObject | null
type Options = AddEventListenerOptions | boolean | undefined

const standing = new Map<string, () => void>()

function captureOf(options: Options): boolean {
  if (typeof options === 'boolean') return options

  return options?.capture === true
}

function firesOnce(options: Options): boolean {
  return typeof options !== 'boolean' && options?.once === true
}

function deliver(listener: Listener, event: Event): void {
  if (typeof listener === 'function') listener(event)
  else listener?.handleEvent(event)
}

function watch(target: EventTarget, what: string): void {
  const add = target.addEventListener.bind(target)
  const remove = target.removeEventListener.bind(target)
  const identities = new WeakMap<object, number>()
  let issued = 0

  function identityOf(listener: Listener): string {
    if (listener === null) return 'none'

    let identity = identities.get(listener)
    if (identity === undefined) {
      issued += 1
      identity = issued
      identities.set(listener, identity)
    }

    return String(identity)
  }

  function keyFor(type: string, listener: Listener, options: Options): string {
    return `${what} ${type} ${identityOf(listener)} ${String(captureOf(options))}`
  }

  Object.defineProperty(target, 'addEventListener', {
    configurable: true,
    value: (type: string, listener: Listener, options?: Options) => {
      const key = keyFor(type, listener, options)
      const settle = (): void => {
        standing.delete(key)
      }
      const heard: Listener = firesOnce(options)
        ? (event: Event) => {
            settle()
            deliver(listener, event)
          }
        : listener

      standing.set(key, () => {
        remove(type, heard, options)
        settle()
      })
      add(type, heard, options)
    },
  })

  Object.defineProperty(target, 'removeEventListener', {
    configurable: true,
    value: (type: string, listener: Listener, options?: Options) => {
      const undo = standing.get(keyFor(type, listener, options))
      if (undo === undefined) {
        remove(type, listener, options)

        return
      }

      undo()
    },
  })
}

export function watchListeners(): void {
  watch(window, 'window')
  watch(document, 'document')
}

export function failOnLeakedListener(): void {
  const leaked = [...standing.keys()].map((key) => key.split(' ').slice(0, 2).join(':')).sort()
  for (const undo of [...standing.values()]) undo()
  standing.clear()

  expect(leaked, LEAKED_LISTENER).toStrictEqual(NOTHING_STANDING)
}
