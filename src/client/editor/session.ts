'use sanity'

import { DocumentRequestError, type DocumentClient } from './document-client.ts'

const HTTP_NOT_FOUND = 404

export interface Session {
  load: (id: string) => Promise<string>
  save: (id: string, content: string) => Promise<void>
}

function isAbsent(error: unknown): boolean {
  return error instanceof DocumentRequestError && error.status === HTTP_NOT_FOUND
}

export function defaultTemplate(id: string): string {
  const name = id.slice(id.lastIndexOf('/') + 1).replace(/\.md$/u, '')
  return `# ${name}\n\nTODO: start writing.\n`
}

export function createSession(client: DocumentClient, template: (id: string) => string = defaultTemplate): Session {
  return {
    async load(id: string): Promise<string> {
      try {
        return await client.read(id)
      } catch (error) {
        if (isAbsent(error)) return template(id)
        throw error
      }
    },

    async save(id: string, content: string): Promise<void> {
      await client.save(id, content)
    },
  }
}
