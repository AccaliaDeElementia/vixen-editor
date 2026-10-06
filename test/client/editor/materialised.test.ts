'use sanity'

import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'

import { createMaterialised, TestOnly } from '../../../src/client/editor/materialised.ts'

const { LOADED_EDITORS } = TestOnly

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc })
}

describe('keeping an editor loaded', () => {
  it('gives it back when the document still says the same thing', () => {
    const held = createMaterialised()
    const state = stateOf('# one')
    held.remember('a.md', state)

    expect(held.recall('a.md', '# one')).toBe(state)
  })

  it('gives nothing back for a document it never held', () => {
    expect(createMaterialised().recall('a.md', '# one')).toBeNull()
  })

  it('gives nothing back when the store has moved on, so a stale buffer cannot surface', () => {
    const held = createMaterialised()
    held.remember('a.md', stateOf('# one'))

    expect(held.recall('a.md', '# changed elsewhere')).toBeNull()
  })

  it('replaces what it held for a path rather than keeping both', () => {
    const held = createMaterialised()
    held.remember('a.md', stateOf('# one'))
    const later = stateOf('# two')

    held.remember('a.md', later)

    expect(held.recall('a.md', '# two')).toBe(later)
  })
})

describe('the bound on how many it keeps', () => {
  function filledPastTheLimit(): ReturnType<typeof createMaterialised> {
    const held = createMaterialised()
    for (let at = 0; at <= LOADED_EDITORS; at += 1) held.remember(`doc${String(at)}.md`, stateOf(`# ${String(at)}`))

    return held
  }

  it('lets the oldest go when one too many is kept', () => {
    expect(filledPastTheLimit().recall('doc0.md', '# 0')).toBeNull()
  })

  it('keeps the newest', () => {
    expect(filledPastTheLimit().recall(`doc${String(LOADED_EDITORS)}.md`, `# ${String(LOADED_EDITORS)}`)).not.toBeNull()
  })

  it('keeps one that was asked for recently, rather than one merely kept early', () => {
    const held = createMaterialised()
    for (let at = 0; at < LOADED_EDITORS; at += 1) held.remember(`doc${String(at)}.md`, stateOf(`# ${String(at)}`))
    held.recall('doc0.md', '# 0')

    held.remember('newest.md', stateOf('# newest'))

    expect(held.recall('doc0.md', '# 0')).not.toBeNull()
  })

  it('lets go of the one that has gone longest without being asked for', () => {
    const held = createMaterialised()
    for (let at = 0; at < LOADED_EDITORS; at += 1) held.remember(`doc${String(at)}.md`, stateOf(`# ${String(at)}`))
    held.recall('doc0.md', '# 0')

    held.remember('newest.md', stateOf('# newest'))

    expect(held.recall('doc1.md', '# 1')).toBeNull()
  })
})
