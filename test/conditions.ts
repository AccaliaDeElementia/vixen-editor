'use sanity'

export function given(condition: () => void): void {
  condition()
}

export async function givenAsync<T>(condition: Promise<T>): Promise<T> {
  return await condition
}
