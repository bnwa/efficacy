export interface IO {}

// Type utility to help consumers define IO operations
export type IOOperation<TArgs extends any[] = any[], TReturn = any> = (...args: TArgs) => Promise<TReturn>

// Helper type to ensure IO operations are properly typed
export type ValidIO = Record<string, IOOperation>

export function defineIO<T extends ValidIO>(spec: T) : IO {
  return spec satisfies IO
}
