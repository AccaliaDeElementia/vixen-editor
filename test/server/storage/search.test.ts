'use sanity'

import { describe, expect, it } from 'vitest'

import { compareNames } from '../../../src/server/storage/primitives/name-order.ts'
import { searchStore, TestOnly } from '../../../src/server/storage/search.ts'

const { MOST_HITS, EXCERPT_MAX, EXCERPT_LEAD } = TestOnly

const UNREADABLE = 'locked.md'

type Held = Record<string, string>

function storeHolding(held: Held): Parameters<typeof searchStore>[0] {
  return {
    list: (byName: (a: string, b: string) => number) => Promise.resolve(Object.keys(held).sort(byName)),
    read: (id: string) => (id === UNREADABLE ? Promise.reject(new Error('gone')) : Promise.resolve(held[id] ?? '')),
  }
}

async function searching(held: Held, query: string): ReturnType<typeof searchStore> {
  return await searchStore(storeHolding(held), { query, byName: compareNames })
}

describe('what a scan of the store finds', () => {
  it('matches however the reader cased what they typed', async () => {
    const { hits } = await searching({ 'notes.md': 'The Alarm rang\n' }, 'alarm')

    expect(hits.map((hit) => hit.excerpt)).toStrictEqual(['The Alarm rang'])
  })

  it('counts the line from one, the way an editor shows it', async () => {
    const { hits } = await searching({ 'notes.md': 'first\nsecond\nthird wanted\n' }, 'wanted')

    expect(hits.map((hit) => hit.line)).toStrictEqual([3])
  })

  it('gives the offset into the document, which is where the caret has to land', async () => {
    const text = 'first\nsecond wanted\n'
    const { hits } = await searching({ 'notes.md': text }, 'wanted')

    expect(hits.map((hit) => hit.offset)).toStrictEqual([text.indexOf('wanted')])
  })

  it('finds every match on a line, not only the first', async () => {
    const { hits } = await searching({ 'notes.md': 'tea and more tea\n' }, 'tea')

    expect(hits.map((hit) => hit.offset)).toStrictEqual([0, 'tea and more '.length])
  })

  it('reads every document in the store, in the order they were listed', async () => {
    const { hits } = await searching({ 'b.md': 'wanted here\n', 'a.md': 'wanted there\n' }, 'wanted')

    expect(hits.map((hit) => hit.path)).toStrictEqual(['a.md', 'b.md'])
  })

  it('finds nothing in a store that holds nothing like it', async () => {
    const { hits } = await searching({ 'notes.md': 'nothing of the sort\n' }, 'wanted')

    expect(hits).toStrictEqual([])
  })

  it('passes over a document it cannot read, because a scan outlives one deleted file', async () => {
    const { hits } = await searching({ [UNREADABLE]: 'wanted', 'readable.md': 'wanted' }, 'wanted')

    expect(hits.map((hit) => hit.path)).toStrictEqual(['readable.md'])
  })
})

describe('a search with more matches than it will carry', () => {
  const PAST_THE_CAP = MOST_HITS + 10

  it('stops at the cap rather than answering with the whole store', async () => {
    const { hits } = await searching({ 'notes.md': 'x '.repeat(PAST_THE_CAP) }, 'x')

    expect(hits).toHaveLength(MOST_HITS)
  })

  it('says it stopped, so the reader knows there are more', async () => {
    const { capped } = await searching({ 'notes.md': 'x '.repeat(PAST_THE_CAP) }, 'x')

    expect(capped).toBe(true)
  })

  it('says nothing of the sort when it reached the end', async () => {
    const { capped } = await searching({ 'notes.md': 'x and x\n' }, 'x')

    expect(capped).toBe(false)
  })

  it('leaves the documents after the cap unread, rather than reading the store twice over', async () => {
    const read: string[] = []
    const store = {
      list: () => Promise.resolve(['full.md', 'later.md']),
      read: (id: string) => {
        read.push(id)

        return Promise.resolve('x '.repeat(PAST_THE_CAP))
      },
    }

    await searchStore(store, { query: 'x', byName: compareNames })

    expect(read).toStrictEqual(['full.md'])
  })
})

describe('the excerpt a hit carries', () => {
  const LONG_LINE = 'z'.repeat(EXCERPT_MAX)
  const PAST_THE_LEAD = 1

  it('is the whole line where the line is short enough to read', async () => {
    const { hits } = await searching({ 'notes.md': '  indented wanted line\n' }, 'wanted')

    expect(hits.map((hit) => hit.excerpt)).toStrictEqual(['  indented wanted line'])
  })

  it('is the whole of a line exactly at the limit, rather than a window one character short of it', async () => {
    const wanted = `${'z'.repeat(EXCERPT_LEAD + PAST_THE_LEAD)}wanted`.padEnd(EXCERPT_MAX, 'z')

    const { hits } = await searching({ 'notes.md': wanted }, 'wanted')

    expect(hits.map((hit) => hit.excerpt)).toStrictEqual([wanted])
  })

  it('is a window around a match buried in a long line, marked at both ends', async () => {
    const { hits } = await searching({ 'notes.md': `${LONG_LINE}wanted${LONG_LINE}` }, 'wanted')
    const [excerpt = ''] = hits.map((hit) => hit.excerpt)

    expect([excerpt.startsWith('…'), excerpt.includes('wanted'), excerpt.endsWith('…')]).toStrictEqual([
      true,
      true,
      true,
    ])
  })

  it('is marked only at the end where the match is at the start of a long line', async () => {
    const { hits } = await searching({ 'notes.md': `wanted${LONG_LINE}` }, 'wanted')
    const [excerpt = ''] = hits.map((hit) => hit.excerpt)

    expect([excerpt.startsWith('…'), excerpt.endsWith('…')]).toStrictEqual([false, true])
  })

  it('is marked only at the start where the match is at the end of a long line', async () => {
    const { hits } = await searching({ 'notes.md': `${LONG_LINE}wanted` }, 'wanted')
    const [excerpt = ''] = hits.map((hit) => hit.excerpt)

    expect([excerpt.startsWith('…'), excerpt.endsWith('…')]).toStrictEqual([true, false])
  })
})

describe('a line whose case folds to a different length', () => {
  const FOLDS_TO_TWO_CHARACTERS = 'İ'
  const LONGER_THAN_IT_IS = 2
  const LONG_LINE = 'z'.repeat(EXCERPT_MAX)

  it('relies on a character whose lowercase is longer than it is, which is what shifts the offsets', () => {
    expect(FOLDS_TO_TWO_CHARACTERS.toLowerCase()).toHaveLength(LONGER_THAN_IT_IS)
  })

  it('gives the offset the document holds, not the one the folded copy holds', async () => {
    const text = `${FOLDS_TO_TWO_CHARACTERS}stanbul wanted\n`
    const { hits } = await searching({ 'notes.md': text }, 'wanted')

    expect(hits.map((hit) => hit.offset)).toStrictEqual([text.indexOf('wanted')])
  })

  it('counts every match on the line from the text as written, not only the first', async () => {
    const text = `${FOLDS_TO_TWO_CHARACTERS} wanted and wanted\n`
    const { hits } = await searching({ 'notes.md': text }, 'wanted')

    expect(hits.map((hit) => hit.offset)).toStrictEqual([text.indexOf('wanted'), text.lastIndexOf('wanted')])
  })

  it('cuts the excerpt from the line as written, so the lead before the match is the agreed one', async () => {
    const { hits } = await searching({ 'notes.md': `${FOLDS_TO_TWO_CHARACTERS}${LONG_LINE}wanted` }, 'wanted')

    expect(hits.map((hit) => hit.excerpt)).toStrictEqual([`…${'z'.repeat(EXCERPT_LEAD)}wanted`])
  })

  it('still folds it onto the letter the reader typed, which is what a case-blind search means', async () => {
    const { hits } = await searching({ 'notes.md': `${FOLDS_TO_TWO_CHARACTERS}stanbul\n` }, 'i')

    expect(hits.map((hit) => hit.excerpt)).toStrictEqual([`${FOLDS_TO_TWO_CHARACTERS}stanbul`])
  })

  it('leaves a line that folds to the same length exactly where it was', async () => {
    const text = 'Istanbul wanted\n'
    const { hits } = await searching({ 'notes.md': text }, 'wanted')

    expect(hits.map((hit) => hit.offset)).toStrictEqual([text.indexOf('wanted')])
  })
})
