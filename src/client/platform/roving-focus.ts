'use sanity'

import { KEYS } from './help.ts'

const CONTROL_SELECTOR = 'button'
const OUT_OF_REACH = '[disabled]'

const REACHABLE = 0
const PASSED_OVER = -1
const NEXT = 1
const PREVIOUS = -1
const FIRST = 0
const LAST = -1

export function rovingFocus(container: HTMLElement): void {
  function controls(): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)]
  }

  function steppable(): HTMLElement[] {
    return controls().filter((control) => !control.matches(OUT_OF_REACH))
  }

  function markReachable(chosen: HTMLElement): void {
    for (const control of controls()) control.tabIndex = control === chosen ? REACHABLE : PASSED_OVER
  }

  function focusedIn(all: readonly HTMLElement[]): number {
    return all.findIndex((control) => control === document.activeElement)
  }

  function focusAt(index: number): boolean {
    const all = steppable()
    const chosen = all.at(index % all.length)
    if (chosen === undefined) return false

    markReachable(chosen)
    chosen.focus()

    return true
  }

  function steppedFrom(key: string, from: number): boolean {
    if (key === KEYS.nextControl) return focusAt(from + NEXT)
    if (key === KEYS.previousControl) return focusAt(from + PREVIOUS)
    if (key === KEYS.firstControl) return focusAt(FIRST)
    if (key === KEYS.lastControl) return focusAt(LAST)

    return false
  }

  container.addEventListener('keydown', (event: KeyboardEvent) => {
    if (steppedFrom(event.key, focusedIn(steppable()))) event.preventDefault()
  })

  container.addEventListener('focusin', () => {
    const all = steppable()
    const { [focusedIn(all)]: reached } = all
    if (reached !== undefined) markReachable(reached)
  })

  const [opening] = steppable()
  if (opening !== undefined) markReachable(opening)
}
