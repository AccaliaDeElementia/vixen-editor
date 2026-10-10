'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { blockAt, positionedBlocksIn } from '../../../src/client/preview/preview-body.ts'

const BEFORE_EVERYTHING = 0
const INSIDE_THE_SECOND = 25
const PAST_EVERYTHING = 9_999

let body: HTMLElement = document.createElement('div')

function fill(markup: string): void {
  body.innerHTML = markup
}

function offsetsShown(): Array<string | undefined> {
  return positionedBlocksIn(body).map((block) => block.dataset.from)
}

beforeEach(() => {
  body = document.createElement('div')
  document.body.append(body)
})

describe('positionedBlocksIn', () => {
  it('finds the blocks that know where they came from, in the order they are shown', () => {
    fill('<p data-from="0">a</p><p data-from="10">b</p>')

    expect(offsetsShown()).toStrictEqual(['0', '10'])
  })

  it('passes over a block that carries no source position, which cannot be scrolled to', () => {
    fill('<p data-from="0">a</p><hr><p data-from="10">b</p>')

    expect(offsetsShown()).toStrictEqual(['0', '10'])
  })

  it('finds nothing in an empty preview', () => {
    expect(positionedBlocksIn(body)).toStrictEqual([])
  })
})

describe('blockAt', () => {
  function threeBlocks(): void {
    fill('<p data-from="0">a</p><p data-from="20">b</p><p data-from="40">c</p>')
  }

  it('is the last block that began at or before the offset', () => {
    threeBlocks()

    expect(blockAt(body, INSIDE_THE_SECOND)?.dataset.from).toBe('20')
  })

  it('is the block that begins exactly at the offset', () => {
    threeBlocks()

    expect(blockAt(body, BEFORE_EVERYTHING)?.dataset.from).toBe('0')
  })

  it('is the final block for an offset past every one of them', () => {
    threeBlocks()

    expect(blockAt(body, PAST_EVERYTHING)?.dataset.from).toBe('40')
  })

  it('is nothing when every block begins after the offset', () => {
    fill('<p data-from="20">b</p>')

    expect(blockAt(body, BEFORE_EVERYTHING)).toBeNull()
  })

  it('is nothing at all in an empty preview', () => {
    expect(blockAt(body, INSIDE_THE_SECOND)).toBeNull()
  })
})
