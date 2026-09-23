'use sanity'

import type { DocumentStore } from '../../src/server/storage/fs-store.ts'

// Every method rejects with the same unrecognised fault, so a route under test
// has to map it to a 500 rather than mistaking it for a missing document.
export function failingStore(): DocumentStore {
  function fail(): Promise<never> {
    return Promise.reject(new Error('disk on fire'))
  }

  return {
    list: fail,
    tree: fail,
    read: fail,
    updateDocument: fail,
    createDocument: fail,
    createFolder: fail,
    createUpload: fail,
    readBytes: fail,
    move: fail,
    trash: fail,
    listTrash: fail,
    restore: fail,
    purge: fail,
  }
}
