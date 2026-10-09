'use sanity'

import { describe, expect, it, vi } from 'vitest'

import { createChannel, createSignal } from '../../../../src/client/platform/announce/channel.ts'

interface Nested {
  above: HTMLElement
  beneath: HTMLElement
}

function nested(): Nested {
  const above = document.createElement('div')
  const beneath = document.createElement('div')
  above.append(beneath)
  document.body.append(above)

  return { above, beneath }
}

describe('a signal', () => {
  it('reaches a listener above the node it was raised from', () => {
    const { above, beneath } = nested()
    const signal = createSignal('vixen:probe-signal')
    const heard = vi.fn<() => void>()
    signal.listen(above, heard)

    signal.raiseFrom(beneath)

    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('announced at a node stays there, which is what separates announcing from raising', () => {
    const { above, beneath } = nested()
    const signal = createSignal('vixen:probe-signal')
    const heard = vi.fn<() => void>()
    signal.listen(above, heard)

    signal.announceAt(beneath)

    expect(heard).not.toHaveBeenCalled()
  })
})

describe('a channel carrying a payload', () => {
  it('reaches a listener above the node it was raised from', () => {
    const { above, beneath } = nested()
    const channel = createChannel<string>('vixen:probe-channel')
    const heard: string[] = []
    channel.listen(above, (payload: string) => {
      heard.push(payload)
    })

    channel.raiseFrom(beneath, 'carried')

    expect(heard).toStrictEqual(['carried'])
  })

  it('announced at a node stays there, which is what separates announcing from raising', () => {
    const { above, beneath } = nested()
    const channel = createChannel<string>('vixen:probe-channel')
    const heard: string[] = []
    channel.listen(above, (payload: string) => {
      heard.push(payload)
    })

    channel.announceAt(beneath, 'carried')

    expect(heard).toStrictEqual([])
  })
})
