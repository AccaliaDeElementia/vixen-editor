'use sanity'

import { parseTrash, parseTree, type TrashNode, type TreeNode } from './tree-model.ts'

export interface FilesClient {
  tree: () => Promise<TreeNode[]>
  trash: () => Promise<TrashNode[]>
}

export class FilesRequestError extends Error {
  override readonly name = 'FilesRequestError'
  readonly status: number

  constructor(status: number) {
    super(`File listing failed with status ${String(status)}`)
    this.status = status
  }
}

export function createFilesClient(fetchImpl: typeof fetch = globalThis.fetch, baseUrl = '/api'): FilesClient {
  async function payloadOf(url: string): Promise<unknown> {
    const response = await fetchImpl(url, { method: 'GET' })
    if (!response.ok) throw new FilesRequestError(response.status)

    return await response.json()
  }

  return {
    async tree(): Promise<TreeNode[]> {
      return parseTree(await payloadOf(`${baseUrl}/files`))
    },

    async trash(): Promise<TrashNode[]> {
      return parseTrash(await payloadOf(`${baseUrl}/trash`))
    },
  }
}
