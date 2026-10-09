'use sanity'

const RAISED = { bubbles: true }

interface Signal {
  announceAt: (root: ParentNode) => void
  raiseFrom: (target: EventTarget) => void
  listen: (root: ParentNode, handle: () => void) => () => void
}

interface Channel<Payload> {
  announceAt: (root: ParentNode, payload: Payload) => void
  raiseFrom: (target: EventTarget, payload: Payload) => void
  listen: (root: ParentNode, handle: (payload: Payload) => void) => () => void
}

function listening(name: string, root: ParentNode, hear: (event: Event) => void): () => void {
  root.addEventListener(name, hear)

  return () => {
    root.removeEventListener(name, hear)
  }
}

export function createSignal(name: string): Signal {
  function announceAt(root: ParentNode): void {
    root.dispatchEvent(new Event(name))
  }

  function raiseFrom(target: EventTarget): void {
    target.dispatchEvent(new Event(name, RAISED))
  }

  function listen(root: ParentNode, handle: () => void): () => void {
    return listening(name, root, () => {
      handle()
    })
  }

  return { announceAt, raiseFrom, listen }
}

export function createChannel<Payload>(name: string): Channel<Payload> {
  const carried = new WeakMap<Event, { payload: Payload }>()

  function raise(payload: Payload, init?: EventInit): Event {
    const event = new Event(name, init)
    carried.set(event, { payload })

    return event
  }

  function announceAt(root: ParentNode, payload: Payload): void {
    root.dispatchEvent(raise(payload))
  }

  function raiseFrom(target: EventTarget, payload: Payload): void {
    target.dispatchEvent(raise(payload, RAISED))
  }

  function listen(root: ParentNode, handle: (payload: Payload) => void): () => void {
    return listening(name, root, (event: Event) => {
      const held = carried.get(event)
      if (held !== undefined) handle(held.payload)
    })
  }

  return { announceAt, raiseFrom, listen }
}
