'use sanity'

import { describe, expect, it } from 'vitest'

import { landingFor } from '../../../src/client/document/caret-landing.ts'

const WANTED = 'lantern'
const A_DOCUMENT = `# notes\n\nthe ${WANTED} went out\n`
const WHERE_IT_WAS = A_DOCUMENT.indexOf(WANTED)
const GREW_ABOVE_IT = `# notes\n\nanother line\n\nthe ${WANTED} went out\n`
const SHOUTED = `# notes\n\nthe ${WANTED.toUpperCase()} went out\n`
const WITHOUT_IT = '# notes\n\nthe beacon went out\n'

const A_GAP = '   '
const ON_EITHER_SIDE = `${WANTED}${A_GAP}${WANTED}`
const EXACTLY_BETWEEN = (ON_EITHER_SIDE.indexOf(WANTED) + ON_EITHER_SIDE.lastIndexOf(WANTED)) / 2

describe('a link that names what it matched', () => {
  it('lands on that text wherever the document has since moved it to', () => {
    expect(landingFor(GREW_ABOVE_IT, { offset: WHERE_IT_WAS, matched: WANTED })).toBe(GREW_ABOVE_IT.indexOf(WANTED))
  })

  it('lands on the one nearest the offset it carried, where the document holds it more than once', () => {
    expect(landingFor(ON_EITHER_SIDE, { offset: ON_EITHER_SIDE.length, matched: WANTED })).toBe(
      ON_EITHER_SIDE.lastIndexOf(WANTED),
    )
  })

  it('takes the earlier of two the same distance away, so the same link lands the same way twice', () => {
    expect(landingFor(ON_EITHER_SIDE, { offset: EXACTLY_BETWEEN, matched: WANTED })).toBe(
      ON_EITHER_SIDE.indexOf(WANTED),
    )
  })

  it('finds it in whatever case the document now writes it, as the search that found it did', () => {
    expect(landingFor(SHOUTED, { offset: WHERE_IT_WAS, matched: WANTED })).toBe(SHOUTED.indexOf(WANTED.toUpperCase()))
  })

  it('falls back to the offset it carried once that text has gone from the document', () => {
    expect(landingFor(WITHOUT_IT, { offset: WHERE_IT_WAS, matched: WANTED })).toBe(WHERE_IT_WAS)
  })
})

describe('a link that names no text to look for', () => {
  it('lands on the offset it carried, which is every link made before they carried any', () => {
    expect(landingFor(A_DOCUMENT, { offset: WHERE_IT_WAS, matched: null })).toBe(WHERE_IT_WAS)
  })

  it('lands on the offset it carried when there is no document to look through', () => {
    expect(landingFor(null, { offset: WHERE_IT_WAS, matched: WANTED })).toBe(WHERE_IT_WAS)
  })
})
