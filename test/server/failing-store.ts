'use sanity'

import type { DocumentStore } from '../../src/server/storage/fs-store.ts'

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
    archive: fail,
    move: fail,
    trash: fail,
    listTrash: fail,
    trashEntry: fail,
    restore: fail,
    purge: fail,
  }
}
