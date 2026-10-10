'use sanity'

import { describe, expect, it } from 'vitest'

import { DRAG_KIND_MIME, DRAG_MIME, DRAG_TAB_MIME } from '../../../src/client/platform/drag-payload.ts'

const OURS = [DRAG_MIME, DRAG_KIND_MIME, DRAG_TAB_MIME]

const SET_BY_THE_BROWSER = ['Files', 'text/plain', 'text/uri-list', 'text/html']

describe('the types a drag of ours carries', () => {
  it('are distinct, since every drop handler tells one kind of drag from another by type alone', () => {
    expect(new Set(OURS).size).toBe(OURS.length)
  })

  it('are none of them a type the browser fills in by itself, or a check for one would pass by accident', () => {
    expect(OURS.filter((type) => SET_BY_THE_BROWSER.includes(type))).toStrictEqual([])
  })
})
