export type IOOperation<T extends unknown[] = unknown[], U = unknown> = (...args: T) => Promise<U>

export type ValidIO = Record<string, IOOperation>

export type IO = ValidIO


/**
 * Creates a typed IO specification from the provided operations.
 *
 * ```typescript
 * const io = defineIO({
 *   async readFile(path: string): Promise<string> {
 *     return fs.readFileSync(path, 'utf8')
 *   }
 * })
 * ```
 */
export function defineIO<T extends ValidIO>(spec: T): T {
  return spec
}
