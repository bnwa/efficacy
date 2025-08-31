/**
 * @module
 *
 * Type-safe IO operation definitions with dependency injection.
 *
 * The IO interface enables dependency injection and makes your code testable by allowing
 * mock implementations. Each consumer defines their own isolated IO interface using the
 * `defineIO` helper function, avoiding global pollution and enabling perfect TypeScript inference.
 *
 * ```typescript
 * import { defineIO } from 'efficacy/io'
 *
 * // Define your IO operations - types are automatically preserved
 * export const myIO = defineIO({
 *   async http(uri: string, options?: RequestInit): Promise<Response> {
 *     return fetch(uri, options)
 *   },
 *
 *   async queryDB<T>(query: string, params?: any[]): Promise<T[]> {
 *     return db.query(query, params)
 *   },
 *
 *   async readFile(path: string): Promise<string> {
 *     return fs.readFile(path, 'utf8')
 *   }
 * })
 *
 * // Use with Tasks - specify exactly which operations are needed
 * const processData: Task<Data, Error, Pick<typeof myIO, 'queryDB' | 'readFile'>> =
 *   Task.create(async (io, signal) => {
 *     const config = await io.readFile('config.json')
 *     const records = await io.queryDB('SELECT * FROM data')
 *     return ok({ config, records })
 *   })
 * ```
 */

/**
 * Represents an asynchronous operation that can be performed by the IO system.
 *
 * This type defines the signature for IO operations - functions that take arguments
 * and return Promises. All IO operations must be asynchronous to ensure consistent
 * behavior in the Task and Stream execution model.
 *
 * @template T Tuple type representing the argument types of the operation
 * @template U The return type of the operation (wrapped in Promise)
 *
 * @example
 * ```typescript
 * // Database query operation
 * type QueryOp = IOOperation<[string, any[]], User[]>
 * const queryUsers: QueryOp = async (sql, params) => {
 *   return db.query(sql, params)
 * }
 *
 * // File read operation
 * type ReadFileOp = IOOperation<[string], string>
 * const readFile: ReadFileOp = async (path) => {
 *   return fs.readFile(path, 'utf8')
 * }
 * ```
 */
export type IOOperation<T extends unknown[] = unknown[], U = unknown> = (...args: T) => Promise<U>

/**
 * Represents a valid IO specification as a record of named operations.
 *
 * This type constraint ensures that IO objects contain only valid async operations.
 * Each property must be an IOOperation that returns a Promise.
 *
 * @example
 * ```typescript
 * const validIO: ValidIO = {
 *   fetchUser: async (id: string): Promise<User> => { return await db.getUser(id) },
 *   saveData: async (data: any): Promise<void> => { await db.save(data) },
 *   queryDB: async <T>(sql: string): Promise<T[]> => { return await db.query<T>(sql) }
 * }
 * ```
 */
export type ValidIO = Record<string, IOOperation>

/**
 * The base IO type that all IO specifications must conform to.
 *
 * This is an alias for ValidIO that provides a shorter, more convenient name
 * for type annotations. Use this when defining IO requirements for Tasks and Streams.
 *
 * @example
 * ```typescript
 * // Define IO operations
 * const myIO = defineIO({
 *   database: async (query: string) => db.execute(query),
 *   filesystem: async (path: string, content: string) => fs.writeFile(path, content)
 * })
 *
 * // Use in task with specific operations
 * type MyTask = Task<Data, Error, Pick<typeof myIO, 'database' | 'filesystem'>>
 * ```
 */
export type IO = ValidIO


/**
 * Creates a typed IO specification from the provided operations.
 *
 * This helper function enables perfect TypeScript inference for IO operation definitions.
 * Each consumer can define their own isolated IO interface without conflicts, avoiding
 * global pollution while maintaining full type safety.
 *
 * @template T The IO specification type extending ValidIO
 * @param spec Object containing IO operation definitions
 * @returns The same object with preserved type information
 *
 * @example
 * ```typescript
 * const io = defineIO({
 *   async readFile(path: string): Promise<string> {
 *     return fs.readFile(path, 'utf8')
 *   },
 *   async writeFile(path: string, content: string): Promise<void> {
 *     await fs.writeFile(path, content, 'utf8')
 *   },
 *   async httpGet(url: string): Promise<Response> {
 *     return fetch(url)
 *   }
 * })
 *
 * // TypeScript automatically infers the exact type
 * type MyIOType = typeof io
 * ```
 */
export function defineIO<T extends ValidIO>(spec: T): T {
  return spec
}
