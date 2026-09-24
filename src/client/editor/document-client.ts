'use sanity'

const HTTP_SERVICE_UNAVAILABLE = 503

export class DocumentRequestError extends Error {
  override readonly name = 'DocumentRequestError'
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface LoadedDocument {
  content: string
  etag: string
}

export interface DocumentClient {
  list: () => Promise<string[]>
  read: (id: string) => Promise<LoadedDocument>
  create: (id: string, content: string) => Promise<string>
  save: (id: string, content: string, etag: string) => Promise<string>
  remove: (entryPath: string) => Promise<void>
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

function etagOf(response: Response): string {
  return response.headers.get('etag') ?? ''
}

async function createdEtagOf(response: Response): Promise<string> {
  const body: unknown = await response.json()

  return isRecord(body) && typeof body.etag === 'string' ? body.etag : ''
}

export function createDocumentClient(fetchImpl: typeof fetch = globalThis.fetch, baseUrl = '/api'): DocumentClient {
  const documentsUrl = `${baseUrl}/documents`

  // A 503 is the write lock reporting contention, so one immediate retry turns
  // a lost race into latency. Anything still failing is reported to the caller.
  async function retrying(url: string, init: RequestInit): Promise<Response> {
    const first = await fetchImpl(url, init)
    if (first.status !== HTTP_SERVICE_UNAVAILABLE) return first

    return await fetchImpl(url, init)
  }

  return {
    async list(): Promise<string[]> {
      const response = await fetchImpl(documentsUrl, { method: 'GET' })
      if (!response.ok) await throwRequestError(response)

      return documentIdsOf(await response.json())
    },

    async read(id: string): Promise<LoadedDocument> {
      const response = await fetchImpl(`${documentsUrl}/${encodeDocumentId(id)}`, { method: 'GET' })
      if (!response.ok) await throwRequestError(response)

      return { content: await response.text(), etag: etagOf(response) }
    },

    async create(id: string, content: string): Promise<string> {
      const response = await retrying(`${baseUrl}/files/documents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: id, content }),
      })
      if (!response.ok) await throwRequestError(response)

      return await createdEtagOf(response)
    },

    async save(id: string, content: string, etag: string): Promise<string> {
      const response = await retrying(`${documentsUrl}/${encodeDocumentId(id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'if-match': etag },
        body: JSON.stringify({ content }),
      })
      if (!response.ok) await throwRequestError(response)

      return etagOf(response)
    },

    // Deleting goes to the trash rather than removing bytes, so it is the file
    // API that owns it; the document API has no delete at all.
    async remove(entryPath: string): Promise<void> {
      const response = await retrying(`${baseUrl}/files/entries/${encodeDocumentId(entryPath)}`, { method: 'DELETE' })
      if (!response.ok) await throwRequestError(response)
    },
  }
}
