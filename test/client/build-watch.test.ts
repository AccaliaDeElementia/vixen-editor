'use sanity'

import { describe, expect, it } from 'vitest'

import { buildThePageWasServed, watchBuild } from '../../src/client/build-watch.ts'

const SERVED = 'build-one'
const SERVING = 'build-two'
const SERVING_AGAIN = 'build-three'

function heardFrom(served: string | null): { stale: string[]; hear: (serving: string) => void } {
  const stale: string[] = []

  return {
    stale,
    hear: watchBuild(served, (serving) => {
      stale.push(serving)
    }),
  }
}

describe('noticing that the page is older than the server', () => {
  it('says so when the server is serving a different build', () => {
    const { stale, hear } = heardFrom(SERVED)

    hear(SERVING)

    expect(stale).toStrictEqual([SERVING])
  })

  it('says nothing while the server is serving what the page was given', () => {
    const { stale, hear } = heardFrom(SERVED)

    hear(SERVED)

    expect(stale).toStrictEqual([])
  })

  it('says nothing when the page carries no build, because unknown is not a mismatch', () => {
    const { stale, hear } = heardFrom(null)

    hear(SERVING)

    expect(stale).toStrictEqual([])
  })

  it('says it once however often the connection drops and returns', () => {
    const { stale, hear } = heardFrom(SERVED)

    hear(SERVING)
    hear(SERVING)
    hear(SERVING)

    expect(stale).toStrictEqual([SERVING])
  })

  it('says it again when the server moves on once more, which is new information', () => {
    const { stale, hear } = heardFrom(SERVED)
    hear(SERVING)

    hear(SERVING_AGAIN)

    expect(stale).toStrictEqual([SERVING, SERVING_AGAIN])
  })
})

describe('the build the page was served', () => {
  it('comes from the meta the shell rendered', () => {
    const page = document.createElement('div')
    page.innerHTML = `<meta name="vixen-build" content="${SERVED}">`

    expect(buildThePageWasServed(page)).toBe(SERVED)
  })

  it('is unknown on a page that carries none', () => {
    expect(buildThePageWasServed(document.createElement('div'))).toBeNull()
  })
})
