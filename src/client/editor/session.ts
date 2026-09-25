'use sanity'

import { PAST_SEPARATOR } from '../../shared/sequences.ts'

import { DocumentRequestError, type DocumentClient } from './document-client.ts'

const HTTP_NOT_FOUND = 404

export interface Session {
  load: (id: string) => Promise<string>
  save: (id: string, content: string) => Promise<void>
  rename: (from: string, to: string) => void
}

function isAbsent(error: unknown): boolean {
  return error instanceof DocumentRequestError && error.status === HTTP_NOT_FOUND
}

function defaultTemplate(id: string): string {
  const name = id.slice(id.lastIndexOf('/') + PAST_SEPARATOR).replace(/\.[^.\/]+$/v, '')
  return `# ${name}\n\nTODO: start writing.\n`
}

export function createSession(client: DocumentClient, template: (id: string) => string = defaultTemplate): Session {
  const etags = new Map<string, string>()

  return {
    async load(id: string): Promise<string> {
      try {
        const { content, etag } = await client.read(id)
        etags.set(id, etag)
        return content
      } catch (error) {
        if (!isAbsent(error)) throw error

        etags.delete(id)
        return template(id)
      }
    },

    rename(from: string, to: string): void {
      const etag = etags.get(from)
      etags.delete(from)
      if (etag !== undefined) etags.set(to, etag)
    },

    async save(id: string, content: string): Promise<void> {
      const etag = etags.get(id)
      const neverReachedTheServer = etag === undefined
      const next = neverReachedTheServer ? await client.create(id, content) : await client.save(id, content, etag)

      etags.set(id, next)
    },
  }
}

export const TestOnly = { defaultTemplate }
