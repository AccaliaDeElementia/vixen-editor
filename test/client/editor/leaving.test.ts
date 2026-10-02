'use sanity'

import { describe, expect, it } from 'vitest'

import { describeRefusal } from '../../../src/client/editor/leaving.ts'
import { DocumentRequestError } from '../../../src/client/editor/document-client.ts'

describe('what stopped the save', () => {
  it('says nothing when there was nothing to save', () => {
    expect(describeRefusal('clean', null)).toBeNull()
  })

  it('names the empty buffer, which never reached the server at all', () => {
    expect(describeRefusal('empty', null)).toBe('Empty documents are not stored.')
  })

  it('names a conflict, because the fix is to look at what changed', () => {
    expect(describeRefusal('failed', new DocumentRequestError(412, 'Conflict'))).toBe(
      'It changed on disk since it was loaded.',
    )
  })

  it('names a busy store, because the fix is to try again', () => {
    expect(describeRefusal('failed', new DocumentRequestError(503, 'Busy'))).toBe(
      'The store is busy and did not accept the save.',
    )
  })

  it('falls back to unreachable for a status it has no words for', () => {
    expect(describeRefusal('failed', new DocumentRequestError(500, 'boom'))).toBe('The server could not be reached.')
  })

  it('falls back to unreachable when nothing came back at all', () => {
    expect(describeRefusal('failed', new TypeError('network down'))).toBe('The server could not be reached.')
  })

  it('reports a refusal even while a write is still in flight, rather than staying silent', () => {
    expect(describeRefusal('saving', new DocumentRequestError(412, 'Conflict'))).toBe(
      'It changed on disk since it was loaded.',
    )
  })

  it('reports the empty buffer ahead of any earlier failure, because that is what stops it now', () => {
    expect(describeRefusal('empty', new DocumentRequestError(412, 'Conflict'))).toBe('Empty documents are not stored.')
  })
})
