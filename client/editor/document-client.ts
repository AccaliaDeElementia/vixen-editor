'use sanity'

export class DocumentRequestError extends Error {
  override readonly name = 'DocumentRequestError'
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface DocumentClient {
  list: () => Promise<string[]>
  read: (id: string) => Promise<string>
  save: (id: string, content: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function encodeDocumentId(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/')
}

async function errorMessageOf(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)

  if (isRecord(body) && typeof body.error === 'string') return body.error
  return response.statusText
}

async function throwRequestError(response: Response): Promise<never> {
  throw new DocumentRequestError(response.status, await errorMessageOf(response))
}

function documentIdsOf(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.documents)) return []
  return body.documents.filter((entry): entry is string => typeof entry === 'string')
}

export function createDocumentClient(fetchImpl: typeof fetch = globalThis.fetch, baseUrl = '/api'): DocumentClient {
  const documentsUrl = `${baseUrl}/documents`

  return {
    async list(): Promise<string[]> {
      const response = await fetchImpl(documentsUrl, { method: 'GET' })
      if (!response.ok) await throwRequestError(response)

      return documentIdsOf(await response.json())
    },

    async read(id: string): Promise<string> {
      const response = await fetchImpl(`${documentsUrl}/${encodeDocumentId(id)}`, { method: 'GET' })
      if (!response.ok) await throwRequestError(response)

      return await response.text()
    },

    async save(id: string, content: string): Promise<void> {
      const response = await fetchImpl(`${documentsUrl}/${encodeDocumentId(id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!response.ok) await throwRequestError(response)
    },

    async remove(id: string): Promise<void> {
      const response = await fetchImpl(`${documentsUrl}/${encodeDocumentId(id)}`, { method: 'DELETE' })
      if (!response.ok) await throwRequestError(response)
    },
  }
}
