'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bindTabKeys } from '../../../src/client/editor/tab-keys.ts'

let root: HTMLElement = document.createElement('div')
let answered: string[] = []
let release: () => void = () => undefined

function listening(): void {
  release = bindTabKeys(root, {
    cycle: (by) => {
      answered.push(`cycle ${String(by)}`)
    },
    move: (by) => {
      answered.push(`move ${String(by)}`)
    },
    jumpTo: (position) => {
      answered.push(`jump ${String(position)}`)
    },
    toPane: (towards, forward, carrying) => {
      answered.push(`pane ${towards} ${String(forward)} ${String(carrying)}`)
    },
    close: () => {
      answered.push('close')
    },
    showSource: () => {
      answered.push('source')
    },
    showMarkup: () => {
      answered.push('markup')
    },
  })
}

function press(init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  root.dispatchEvent(event)

  return event.defaultPrevented
}

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div')
  document.body.append(root)
  answered = []
  listening()
})

describe('moving between the tabs of a pane', () => {
  it('goes to the next on Alt and the right bracket', () => {
    press({ key: ']', altKey: true })

    expect(answered).toStrictEqual(['cycle 1'])
  })

  it('goes to the previous on Alt and the left bracket', () => {
    press({ key: '[', altKey: true })

    expect(answered).toStrictEqual(['cycle -1'])
  })

  it('jumps to the tab a digit names', () => {
    press({ key: '3', altKey: true })

    expect(answered).toStrictEqual(['jump 3'])
  })

  it('jumps to the ninth, which is as far as the digits reach', () => {
    press({ key: '9', altKey: true })

    expect(answered).toStrictEqual(['jump 9'])
  })

  it('leaves a digit outside the first nine alone', () => {
    press({ key: '0', altKey: true })

    expect(answered).toStrictEqual([])
  })
})

describe('moving a tab along its strip', () => {
  it('moves it later on the shifted right bracket a reader sends', () => {
    press({ key: '}', altKey: true, shiftKey: true })

    expect(answered).toStrictEqual(['move 1'])
  })

  it('moves it later on the bare bracket the browser suite sends', () => {
    press({ key: ']', altKey: true, shiftKey: true })

    expect(answered).toStrictEqual(['move 1'])
  })

  it('moves it earlier on the shifted left bracket', () => {
    press({ key: '{', altKey: true, shiftKey: true })

    expect(answered).toStrictEqual(['move -1'])
  })

  it('moves it earlier on the bare left bracket with shift held', () => {
    press({ key: '[', altKey: true, shiftKey: true })

    expect(answered).toStrictEqual(['move -1'])
  })
})

describe('the chords that were already bound', () => {
  it('closes on Alt and W', () => {
    press({ key: 'w', altKey: true })

    expect(answered).toStrictEqual(['close'])
  })

  it('shows the source on Alt, Shift and P', () => {
    press({ key: 'P', altKey: true, shiftKey: true })

    expect(answered).toStrictEqual(['source'])
  })

  it('shows the rendered preview on Alt and P', () => {
    press({ key: 'p', altKey: true })

    expect(answered).toStrictEqual(['markup'])
  })
})

describe('what it leaves to the browser', () => {
  it('ignores a chord without Alt', () => {
    press({ key: ']' })

    expect(answered).toStrictEqual([])
  })

  it('ignores a key it has no chord for', () => {
    press({ key: 'q', altKey: true })

    expect(answered).toStrictEqual([])
  })

  it('ignores an event of the same name that carries no key', () => {
    root.dispatchEvent(new Event('keydown', { bubbles: true }))

    expect(answered).toStrictEqual([])
  })

  it('leaves a key it has no chord for undefaulted', () => {
    expect(press({ key: 'q', altKey: true })).toBe(false)
  })

  it('takes a chord it answers, so the browser does not also act on it', () => {
    expect(press({ key: ']', altKey: true })).toBe(true)
  })

  it('stops answering once released', () => {
    release()

    press({ key: ']', altKey: true })

    expect(answered).toStrictEqual([])
  })
})

describe('moving between the editor panes', () => {
  it('goes to the pane on the right', () => {
    press({ key: 'ArrowRight', altKey: true, ctrlKey: true })

    expect(answered).toStrictEqual(['pane beside true false'])
  })

  it('comes back from it on the left', () => {
    press({ key: 'ArrowLeft', altKey: true, ctrlKey: true })

    expect(answered).toStrictEqual(['pane beside false false'])
  })

  it('goes to the pane below', () => {
    press({ key: 'ArrowDown', altKey: true, ctrlKey: true })

    expect(answered).toStrictEqual(['pane below true false'])
  })

  it('comes back from it above', () => {
    press({ key: 'ArrowUp', altKey: true, ctrlKey: true })

    expect(answered).toStrictEqual(['pane below false false'])
  })

  it('carries the tab along when Shift is held', () => {
    press({ key: 'ArrowRight', altKey: true, ctrlKey: true, shiftKey: true })

    expect(answered).toStrictEqual(['pane beside true true'])
  })

  it('leaves an arrow without Ctrl to the editor, which moves lines with it', () => {
    press({ key: 'ArrowDown', altKey: true })

    expect(answered).toStrictEqual([])
  })

  it('leaves the tab chords alone when Ctrl is held, so the two sets do not overlap', () => {
    press({ key: ']', altKey: true, ctrlKey: true })

    expect(answered).toStrictEqual([])
  })
})
