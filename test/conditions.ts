'use sanity'

export function given(condition: () => void): void {
  condition()
}

export async function waitUntil<T>(condition: Promise<T>): Promise<T> {
  return await condition
}
