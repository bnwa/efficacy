// Base IO interface - consumers can extend this via module declaration
// This is intentionally minimal to allow maximum flexibility
export interface IO {
  // Consumers extend this interface via module declaration
  // All IO operations should be Promise-returning functions
}

// Type utility to help consumers define IO operations
export type IOOperation<TArgs extends any[] = any[], TReturn = any> = (...args: TArgs) => Promise<TReturn>

// Helper type to ensure IO operations are properly typed
export type ValidIO = Record<string, IOOperation>

// Re-export JSON types for convenience
export type JSONType =
  | string
  | number
  | boolean
  | null
  | JSONType[]
  | { [key: string]: JSONType }
