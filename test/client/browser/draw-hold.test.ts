'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createDrawHold } from '../../../src/client/browser/draw-hold.ts'

let replays = 0

function holding(): ReturnType<typeof createDrawHold> {
  return createDrawHold(() => {
    replays += 1
  })
}

beforeEach(() => {
  replays = 0
})

describe('drawing while nothing is being dragged', () => {
  it('lets the draw through, so an ordinary redraw is not delayed', () => {
    expect(holding().defer()).toBe(false)
  })

  it('replays nothing when released without ever holding, so a stray release draws nothing', () => {
    const hold = holding()

    hold.release()

    expect(replays).toBe(0)
  })
})

describe('drawing while a drag is in flight', () => {
  it('holds the draw back, because a redraw mid-gesture destroys what the gesture started on', () => {
    const hold = holding()
    hold.hold()

    expect(hold.defer()).toBe(true)
  })

  it('replays the draw it held once the drag ends', () => {
    const hold = holding()
    hold.hold()
    hold.defer()

    hold.release()

    expect(replays).toBe(1)
  })

  it('replays once however many draws were held, because they asked for the same picture', () => {
    const hold = holding()
    hold.hold()
    hold.defer()
    hold.defer()

    hold.release()

    expect(replays).toBe(1)
  })

  it('replays nothing when the drag held nothing back', () => {
    const hold = holding()
    hold.hold()

    hold.release()

    expect(replays).toBe(0)
  })

  it('replays nothing on a second release, because what it held has already been drawn', () => {
    const hold = holding()
    hold.hold()
    hold.defer()
    hold.release()

    hold.release()

    expect(replays).toBe(1)
  })

  it('lets a draw through once the drag is over', () => {
    const hold = holding()
    hold.hold()
    hold.release()

    expect(hold.defer()).toBe(false)
  })
})
