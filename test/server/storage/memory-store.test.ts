'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createMemoryStore } from './memory-store.ts'
import { storeContract } from './store-contract.ts'

let store = createMemoryStore()

beforeEach(() => {
  store = createMemoryStore()
})

storeContract(() => store)

describe('what the in-memory store does not model', () => {
  it('says so rather than answering as though the trash were empty', async () => {
    await expect(createMemoryStore().listTrash()).rejects.toThrow(/document lifecycle/v)
  })
})
