export type IOOperation<T extends unknown[] = unknown[], U = unknown> = (...args: T) => Promise<U>

export type ValidIO = Record<string, IOOperation>

export type IO = ValidIO


export function defineIO<T extends ValidIO>(spec: T): T {
  return spec
}
