'use sanity'

import { parseTrash, parseTree, type TrashNode, type TreeNode } from './tree-model.ts'
import { API_PREFIX } from '../../shared/api.ts'
import { stringsIn } from '../json.ts'
import { isRecord } from '../../shared/guards.ts'

export interface FilesClient {
  tree: () => Promise<TreeNode[]>
  trash: () => Promise<TrashNode[]>
  createDocument: (entryPath: string) => Promise<void>
  createFolder: (folderPath: string) => Promise<void>
  upload: (directory: string, file: File) => Promise<string>
  move: (from: string, to: string) => Promise<string[]>
  remove: (entryPath: string) => Promise<void>
  restore: (entryId: string) => Promise<void>
  purge: (entryId: string) => Promise<void>
}

type RepairedPath = string

export class FilesRequestError extends Error {
  override readonly name = 'FilesRequestError'
  readonly status: number
  readonly code: string
  readonly paths: readonly string[]

  constructor(status: number, message: string, code: string, paths: readonly string[]) {
    super(message)
    this.status = status
    this.code = code
    this.paths = paths
  }
}

async function failureOf(response: Response): Promise<FilesRequestError> {
  const body: unknown = await response.json().catch(() => null)
  if (!isRecord(body)) return new FilesRequestError(response.status, response.statusText, 'UNKNOWN', [])

  const message = typeof body.error === 'string' ? body.error : response.statusText
  const code = typeof body.code === 'string' ? body.code : 'UNKNOWN'

  return new FilesRequestError(response.status, message, code, stringsIn(body.paths))
}

function encodePath(entryPath: string): string {
  return entryPath.split('/').map(encodeURIComponent).join('/')
}

export function createFilesClient(
  fetchImpl: typeof fetch = globalThis.fetch,
  baseUrl: string = API_PREFIX,
): FilesClient {
  async function send(url: string, init: RequestInit): Promise<Response> {
    const response = await fetchImpl(url, init)
    if (!response.ok) throw await failureOf(response)

    return response
  }

  async function payloadOf(url: string): Promise<unknown> {
    return await send(url, { method: 'GET' }).then(async (response): Promise<unknown> => await response.json())
  }

  async function postJson(url: string, body: unknown): Promise<Response> {
    return await send(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  return {
    async tree(): Promise<TreeNode[]> {
      return parseTree(await payloadOf(`${baseUrl}/files`))
    },

    async trash(): Promise<TrashNode[]> {
      return parseTrash(await payloadOf(`${baseUrl}/trash`))
    },

    async createDocument(entryPath: string): Promise<void> {
      await postJson(`${baseUrl}/files/documents`, { path: entryPath })
    },

    async createFolder(folderPath: string): Promise<void> {
      await postJson(`${baseUrl}/files/folders`, { path: folderPath })
    },

    async upload(directory: string, file: File): Promise<string> {
      const form = new FormData()
      form.append('file', file)
      form.append('path', directory)

      const created: unknown = await send(`${baseUrl}/files/uploads`, { method: 'POST', body: form }).then(
        async (response): Promise<unknown> => await response.json(),
      )

      return isRecord(created) && typeof created.path === 'string' ? created.path : ''
    },

    async move(from: string, to: string): Promise<RepairedPath[]> {
      const outcome: unknown = await postJson(`${baseUrl}/files/moves`, { from, to }).then(
        async (response): Promise<unknown> => await response.json().catch(() => null),
      )

      if (!isRecord(outcome) || !Array.isArray(outcome.rewritten)) return []

      return outcome.rewritten.filter((entry): entry is string => typeof entry === 'string')
    },

    async remove(entryPath: string): Promise<void> {
      await send(`${baseUrl}/files/entries/${encodePath(entryPath)}`, { method: 'DELETE' })
    },

    async restore(entryId: string): Promise<void> {
      await send(`${baseUrl}/trash/${encodeURIComponent(entryId)}/restore`, { method: 'POST' })
    },

    async purge(entryId: string): Promise<void> {
      await send(`${baseUrl}/trash/${encodeURIComponent(entryId)}`, { method: 'DELETE' })
    },
  }
}
