'use sanity'

import { NOT_FOUND } from '../shared/sequences.ts'

const REGION_SELECTOR = '#status'
const TOAST_CLASS = 'toast'

const TOAST_VISIBLE_MS = 2500
const ERROR_OUTSTAYS_INFO_BY = 4
const TOAST_ERROR_MS = TOAST_VISIBLE_MS * ERROR_OUTSTAYS_INFO_BY
const FADE_MS = 500

const MAX_VISIBLE = 5
const MAX_QUEUED = 20
const ONE_MORE = 1
const FROM_THE_FRONT = 0
const NOTHING_DROPPED = 0
const OVERFLOW_TEXT = 'more messages'
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

type Severity = 'info' | 'error'

interface ToastHandle {
  update: (message: string) => void
  dismiss: () => void
}

export interface Toast {
  show: (message: string) => ToastHandle
  error: (message: string) => ToastHandle
  dismissRaised: () => void
}

interface Slot {
  severity: Severity
  isOverflow: boolean
  shown: () => boolean
  settling: () => boolean
  says: (text: string) => boolean
  repeat: () => void
  recount: (count: number) => void
  retitle: (text: string) => void
  display: (into: HTMLElement) => void
  hide: (immediately: boolean) => void
}

function dwellFor(severity: Severity): number {
  return severity === 'error' ? TOAST_ERROR_MS : TOAST_VISIBLE_MS
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches
}

function createSlot(severity: Severity, initial: string, isOverflow: boolean, gone: () => void): Slot {
  let text = initial
  let count = ONE_MORE
  let element: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let fading = false

  function label(): string {
    return count > ONE_MORE ? `${text} (${String(count)})` : text
  }

  function stopTimer(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function detach(): void {
    element?.remove()
    element = null
    fading = false
    gone()
  }

  function hide(immediately: boolean): void {
    stopTimer()
    if (element === null) return
    if (immediately || prefersReducedMotion()) {
      detach()
      return
    }

    fading = true
    element.dataset.fading = 'true'
    timer = setTimeout(detach, FADE_MS)
  }

  function dwell(): void {
    stopTimer()
    timer = setTimeout(() => {
      hide(false)
    }, dwellFor(severity))
  }

  function refresh(): void {
    if (element === null) return

    fading = false
    delete element.dataset.fading
    element.textContent = label()
    dwell()
  }

  return {
    severity,
    isOverflow,
    shown: () => element !== null,
    settling: () => fading,
    says: (candidate: string) => candidate === text,

    repeat(): void {
      count += ONE_MORE
      refresh()
    },

    recount(next: number): void {
      count = next
      refresh()
    },

    retitle(next: string): void {
      text = next
      count = ONE_MORE
      refresh()
    },

    display(into: HTMLElement): void {
      const created = document.createElement('div')
      created.className = TOAST_CLASS
      created.dataset.severity = severity
      created.textContent = label()
      created.addEventListener('click', () => {
        hide(fading)
      })

      element = created
      into.append(created)
      dwell()
    },

    hide,
  }
}

interface Controller {
  add: (severity: Severity, text: string) => ToastHandle
}

function createController(region: HTMLElement): Controller {
  let shown: Slot[] = []
  const queued: Slot[] = []
  let overflowed = NOTHING_DROPPED

  function shownErrors(): number {
    return shown.filter((slot) => slot.severity === 'error').length
  }

  function hasRoomFor(severity: Severity): boolean {
    if (shown.length < MAX_VISIBLE) return true

    const failureOverChatter = severity === 'error' && shownErrors() < MAX_VISIBLE

    return failureOverChatter
  }

  function promote(): void {
    for (;;) {
      const queuedFailure = queued.findIndex((slot) => slot.severity === 'error')
      const at = queuedFailure === NOT_FOUND ? FROM_THE_FRONT : queuedFailure
      const next = queued.at(at)
      if (next === undefined || !hasRoomFor(next.severity)) return

      queued.splice(at, ONE_MORE)
      shown.push(next)
      next.display(region)
    }
  }

  function reap(): void {
    shown = shown.filter((slot) => slot.shown())
    promote()
  }

  function admit(slot: Slot): void {
    if (hasRoomFor(slot.severity)) {
      shown.push(slot)
      slot.display(region)
      return
    }

    if (slot.isOverflow) {
      queued.unshift(slot)
      return
    }

    if (queued.length >= MAX_QUEUED) {
      overflow()
      return
    }

    queued.push(slot)
  }

  function liveSlot(severity: Severity, text: string): Slot | undefined {
    return [...shown, ...queued].find((slot) => slot.severity === severity && slot.says(text) && !slot.settling())
  }

  function overflow(): void {
    overflowed += ONE_MORE
    const summary = liveSlot('info', OVERFLOW_TEXT)
    if (summary !== undefined) {
      summary.recount(overflowed)
      return
    }

    const created = createSlot('info', OVERFLOW_TEXT, true, reap)
    created.recount(overflowed)
    admit(created)
  }

  function handleFor(slot: Slot): ToastHandle {
    return {
      update(message: string): void {
        slot.retitle(message)
        if (!slot.shown() && !queued.includes(slot)) admit(slot)
      },
      dismiss(): void {
        const at = queued.indexOf(slot)
        if (at !== NOT_FOUND) queued.splice(at, ONE_MORE)
        if (!slot.settling()) slot.hide(true)
      },
    }
  }

  return {
    add(severity: Severity, text: string): ToastHandle {
      const existing = liveSlot(severity, text)
      if (existing !== undefined) {
        existing.repeat()

        return handleFor(existing)
      }

      const slot = createSlot(severity, text, false, reap)
      admit(slot)

      return handleFor(slot)
    },
  }
}

const controllers = new WeakMap<HTMLElement, Controller>()
const INERT: ToastHandle = { update: () => undefined, dismiss: () => undefined }

function controllerFor(region: HTMLElement): Controller {
  const existing = controllers.get(region)
  if (existing !== undefined) return existing

  const created = createController(region)
  controllers.set(region, created)

  return created
}

export function createToast(root: ParentNode = document): Toast {
  const region = root.querySelector<HTMLElement>(REGION_SELECTOR)
  const raised = new Set<ToastHandle>()

  function add(severity: Severity, message: string): ToastHandle {
    if (region === null) return INERT

    const handle = controllerFor(region).add(severity, message)
    raised.add(handle)

    return handle
  }

  return {
    dismissRaised(): void {
      for (const handle of raised) handle.dismiss()
      raised.clear()
    },

    show: (message: string) => add('info', message),
    error: (message: string) => add('error', message),
  }
}

export const TestOnly = {
  FADE_MS,
  MAX_QUEUED,
  MAX_VISIBLE,
  OVERFLOW_TEXT,
  REDUCED_MOTION,
  TOAST_ERROR_MS,
  TOAST_VISIBLE_MS,
}
