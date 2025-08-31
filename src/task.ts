/**
 * @module
 *
 * Asynchronous computations with typed IO dependencies.
 *
 * The `Task<T, E, TaskIO>` type represents an asynchronous computation that produces a value
 * of type `T` on success, fails with an error of type `E`, and requires IO operations defined
 * in `TaskIO`. Tasks are lazy (don't execute until `.run()` is called) and composable through
 * monadic operations.
 *
 * ```typescript
 * import { Task, ok, fail } from 'efficacy/task'
 *
 * // Simple task that always succeeds
 * const simpleTask: Task<string, never, {}> = Task.of('Hello World')
 *
 * // Task with custom error type and IO dependencies
 * type AppError = { message: string; code: number }
 *
 * const processUser = (id: string): Task<User, AppError, Pick<MyIO, 'queryDB'>> => {
 *   return Task.create(async (io, signal) => {
 *     try {
 *       const users = await io.queryDB('SELECT * FROM users WHERE id = ?', [id])
 *       return users.length > 0 ? ok(users[0]) : fail({ message: 'Not found', code: 404 })
 *     } catch (error) {
 *       return fail({ message: error.message, code: 500 })
 *     }
 *   })
 * }
 *
 * // Compose with monadic operations
 * const pipeline = Task.of(10)
 *   .map(x => x * 2)                    // Task<number, never, {}>
 *   .flatMap(x => Task.of(x + 5))       // Task<number, never, {}>
 *   .orElseMap(err => 0)                // Task<number, never, {}>
 *
 * const result = await pipeline.run({})
 * ```
 */

import type { IO } from './io.js'

import { Stream } from './stream.js'
import { ok as progOk } from './stream.js'
import { fail as progFail } from './stream.js'

import type { Failure } from './result.js'
import type { Result } from './result.js'
import { ok } from './result.js'
import { fail } from './result.js'
import { isFailure } from './result.js'


/**
 * Function signature for initializing a Task with IO dependencies and optional cancellation.
 *
 * This type defines the shape of functions that create Task instances. Tasks are lazy,
 * meaning they don't execute until `.run()` is called with the required IO dependencies.
 *
 * @template T The type of the success value
 * @template E The type of error values
 * @template TaskIO The IO operations required by this task
 *
 * @param io IO operations object containing the dependencies needed by the task
 * @param signal Optional AbortSignal for cancellation support
 * @returns Promise that resolves to a Result containing either success or error
 */
type TaskInit<T, E, TaskIO extends Partial<IO>> =
  (io: TaskIO, signal?: AbortSignal) => Promise<Result<T, E>>


/**
 * Represents an asynchronous computation with typed IO dependencies.
 *
 * The Task type represents a single asynchronous operation that produces a value of type `T`
 * on success, fails with an error of type `E`, and requires IO operations defined in `TaskIO`.
 * Tasks are lazy (don't execute until `.run()` is called) and composable through monadic operations.
 *
 * Tasks support:
 * - Lazy evaluation with dependency injection
 * - Monadic composition with `map`, `flatMap`, and error handling
 * - Cancellation through AbortSignal
 * - Type-safe IO requirements specification
 * - Conversion to/from Streams for interoperability
 *
 * @template T The type of the success value
 * @template E The type of error values
 * @template TaskIO The IO operations required by this task (subset of IO)
 *
 * @example
 * ```typescript
 * // Simple task without IO dependencies
 * const simpleTask: Task<string, never, {}> = Task.of('Hello World')
 *
 * // Task with custom error type and IO dependencies
 * type AppError = { message: string; code: number }
 * const processUser = (id: string): Task<User, AppError, Pick<MyIO, 'queryDB'>> => {
 *   return Task.create(async (io, signal) => {
 *     try {
 *       const users = await io.queryDB('SELECT * FROM users WHERE id = ?', [id])
 *       return users.length > 0 ? ok(users[0]) : fail({ message: 'Not found', code: 404 })
 *     } catch (error) {
 *       return fail({ message: error.message, code: 500 })
 *     }
 *   })
 * }
 *
 * // Execute task
 * const result = await processUser('123').run(myIO)
 * ```
 */
export class Task<T, E, TaskIO extends Partial<IO>> {
  run: TaskInit<T, E, TaskIO>
  protected constructor(init: TaskInit<T, E, TaskIO>) {
    this.run = init.bind(this)
  }

  /**
   * Creates a task from an async function.
   *
   * This is the primary constructor for custom tasks that need to perform complex async
   * operations or integrate with existing Promise-based APIs. Use this when you need
   * to perform IO operations or handle complex async logic.
   *
   * @template T The type of the success value
   * @template E The type of error values
   * @template TaskIO The IO operations required by this task
   * @param init Async function that defines the task's behavior
   * @returns A new Task instance
   *
   * @example
   * ```typescript
   * const fetchUser = Task.create<User, Error, Pick<MyIO, 'http'>>(async (io, signal) => {
   *   try {
   *     const response = await io.http('/api/users/123')
   *     if (!response.ok) {
   *       return fail(new Error(`HTTP ${response.status}: ${response.statusText}`))
   *     }
   *     const user = await response.json()
   *     return ok(user)
   *   } catch (error) {
   *     return fail(error)
   *   }
   * })
   * ```
   */
  static create<T, E, TaskIO extends Partial<IO>>(init: TaskInit<T, E, TaskIO>) : Task<T, E, TaskIO> {
    return new Task(init)
  }

  /**
   * Creates a task that immediately succeeds with the given value.
   *
   * This is useful for starting task chains or converting synchronous values into the
   * task context. The task requires no IO dependencies and cannot fail.
   *
   * @template T The type of the success value
   * @template E The type of potential errors (defaults to never since this always succeeds)
   * @param value The value to wrap in a successful task
   * @returns A Task that immediately succeeds with the provided value
   *
   * @example
   * ```typescript
   * const task = Task.of(42)
   * const result = await task.run({}) // { ok: true, value: 42 }
   *
   * // Can be used to start a task chain
   * const pipeline = Task.of(10)
   *   .map(x => x * 2)
   *   .flatMap(x => fetchDataById(x))
   * ```
   */
  static of<T, E = never>(value: T): Task<T, E, {}> {
    return new Task(async () => ok(value))
  }

  /**
   * Creates a task that immediately fails with the given error.
   *
   * This is useful for error conditions or testing failure scenarios. The task
   * requires no IO dependencies and always fails with the provided error.
   *
   * @template T The type of potential success values
   * @template E The type of the error value
   * @param error The error to fail with
   * @returns A Task that immediately fails with the provided error
   *
   * @example
   * ```typescript
   * const task = Task.reject("Something went wrong")
   * const result = await task.run({}) // { ok: false, error: "Something went wrong" }
   *
   * // Useful for conditional error paths
   * const conditionalTask = condition
   *   ? Task.of(successValue)
   *   : Task.reject("Condition not met")
   * ```
   */
  static reject<T, E>(error: E): Task<T, E, {}> {
    return new Task(async () => fail(error))
  }

  /**
   * Transforms successful values using the provided function.
   *
   * This is the primary tool for data transformation in successful cases. The error type
   * remains the same, making this operation safe and predictable. Error values pass through
   * unchanged, preserving the failure information.
   *
   * @template U The type of the transformed value
   * @param fn Function to transform successful values
   * @returns A new Task with the transformed success type
   *
   * @example
   * ```typescript
   * const task = Task.of(5).map(x => x * 2)
   * const result = await task.run({}) // { ok: true, value: 10 }
   *
   * // Errors pass through unchanged
   * const failing = Task.reject("error").map(x => x * 2)
   * const result2 = await failing.run({}) // { ok: false, error: "error" }
   *
   * // Can be chained
   * const pipeline = Task.of(10)
   *   .map(x => x * 2)       // 20
   *   .map(x => x + 5)       // 25
   *   .map(x => x.toString()) // "25"
   * ```
   */
  map<U>(fn: (value: T) => U): Task<U, E, TaskIO> {
    const prev = this.run
    return Task.create(async (io, signal) => {
      const result = await prev(io, signal)
      return isFailure(result) ?
        result :
        ok(fn(result.value))
    })
  }

  /**
   * Chains tasks together sequentially.
   *
   * The function receives the success value and returns a new task. If either task fails,
   * the entire chain fails. The error types are combined (E | F), and IO requirements can
   * change between tasks.
   *
   * @template U The success type of the next task
   * @template F The error type of the next task
   * @template NextIO The IO requirements of the next task
   * @param fn Function that receives the success value and returns a new task
   * @returns A new Task with combined error types and next IO requirements
   *
   * @example
   * ```typescript
   * const fetchAndProcess = Task.of(123)
   *   .flatMap(id => fetchUser(id))        // Task<User, NetworkError, Pick<IO, 'http'>>
   *   .flatMap(user => validateUser(user)) // Task<User, ValidationError, {}>
   *   .flatMap(user => saveUser(user))     // Task<void, DBError, Pick<IO, 'database'>>
   *
   * // Error types are combined: NetworkError | ValidationError | DBError
   * // IO requirements are: Pick<IO, 'http' | 'database'>
   * ```
   */
  flatMap<U, F, NextIO extends TaskIO>(
    fn: (value: T) => Task<U, F, NextIO>
  ): Task<U, E | F, NextIO> {
    const prev = this.run
    return Task.create(async (io, signal) => {
      const result = await prev(io, signal)
      if (isFailure(result)) return result as Failure<E | F>

      const nextTask = fn(result.value)
      return nextTask.run(io, signal)
    })
  }

  /**
   * Transforms error values while leaving successful values unchanged.
   *
   * Use this to convert between different error types, add context to errors, or
   * normalize error formats across your application. Success values pass through
   * unchanged.
   *
   * @template F The new error type after transformation
   * @param fn Function to transform error values
   * @returns A new Task with the transformed error type
   *
   * @example
   * ```typescript
   * type NetworkError = { code: number; message: string }
   * type AppError = { type: string; details: string; timestamp: Date }
   *
   * const task = fetchData()
   *   .mapError((err: NetworkError) => ({
   *     type: 'NETWORK_ERROR',
   *     details: `${err.code}: ${err.message}`,
   *     timestamp: new Date()
   *   } as AppError))
   *
   * // Success values pass through unchanged
   * // Error values are transformed to AppError format
   * ```
   */
  mapError<F>(fn: (error: E) => F): Task<T, F, TaskIO> {
    const prev = this.run
    return Task.create(async (io, signal) => {
      const result = await prev(io, signal)
      return isFailure(result) ?
        { ok: false, error: fn(result.error) } :
        result
    })
  }

  /**
   * Provides error recovery by running an alternative task when the original fails.
   *
   * The recovery function receives the error and returns a new task. Success values
   * pass through unchanged. This enables sophisticated error handling and fallback
   * strategies.
   *
   * @template F The error type of the recovery task
   * @template NextIO The IO requirements of the recovery task
   * @param fn Function that receives the error and returns a recovery task
   * @returns A new Task that cannot fail with the original error type
   *
   * @example
   * ```typescript
   * const withFallback = fetchUserFromAPI(id)
   *   .orElse(apiError => fetchUserFromCache(id))
   *   .orElse(cacheError => Task.of(createGuestUser()))
   *
   * // Multiple fallback strategies
   * const robustFetch = primaryService()
   *   .orElse(err => secondaryService())
   *   .orElse(err => localCache())
   *   .orElse(err => Task.reject('All services failed'))
   * ```
   */
  orElse<F, NextIO extends TaskIO>(
    fn: (error: E) => Task<T, F, NextIO>
  ): Task<T, F, NextIO> {
    const prev = this.run
    return Task.create(async (io, signal) => {
      const result = await prev(io, signal)
      if (!isFailure(result)) return result

      const recoveryTask = fn(result.error)
      return recoveryTask.run(io, signal)
    })
  }

  /**
   * Directly converts errors to success values using a synchronous function.
   *
   * This eliminates the possibility of failure entirely, returning a `Task<T, never, TaskIO>`
   * that cannot fail. Use this when you have a reasonable default value for any error condition.
   *
   * @param fn Function that converts error values to success values
   * @returns A Task that cannot fail (error type is never)
   *
   * @example
   * ```typescript
   * const safeTask = riskyOperation()
   *   .orElseMap(error => {
   *     console.log('Operation failed, using default:', error)
   *     return defaultValue
   *   })
   *
   * // safeTask has type Task<T, never, TaskIO> - it cannot fail!
   * const result = await safeTask.run(io)
   * // result.ok is always true
   *
   * // Common pattern: provide defaults for missing data
   * const userPreferences = loadUserPrefs(userId)
   *   .orElseMap(() => DEFAULT_PREFERENCES)
   * ```
   */
  orElseMap(fn: (error: E) => T) : Task<T, never, TaskIO> {
    const prev = this.run
    return Task.create(async (io, signal) : Promise<Result<T, never>> => {
      const result = await prev(io, signal)
      if (!isFailure(result)) return result
      else return ok(fn(result.error))
    })
  }

  /**
   * Converts the task to a Stream that emits one progress update with the task's result.
   *
   * Useful when you need to integrate a simple task into a progress-reporting workflow.
   * The stream will emit exactly one progress update containing the task's result, with
   * progress information set to `{ current: 1, total: 1 }`.
   *
   * @returns A Stream that emits the task's result as a single progress update
   *
   * @example
   * ```typescript
   * const task = Task.of(42)
   * const stream = task.toStream()
   * for await (const progress of stream.run({})) {
   *   console.log(progress) // { ok: true, value: 42, progress: { current: 1, total: 1 } }
   * }
   *
   * // Convert failed task to stream
   * const failedStream = Task.reject('error').toStream()
   * for await (const progress of failedStream.run({})) {
   *   console.log(progress) // { ok: false, error: 'error', progress: { current: 1, total: 1 } }
   * }
   *
   * // Useful for mixing tasks and streams in workflows
   * const mixedWorkflow = async function*() {
   *   yield* preparationTask.toStream().run(io)
   *   yield* longRunningStream.run(io)
   *   yield* cleanupTask.toStream().run(io)
   * }
   * ```
   */
  toStream() : Stream<T, E, TaskIO> {
    const prev = this.run
    return Stream.create(async function*(io, signal) {
      const result = await prev(io, signal)
      if (isFailure(result)) {
        yield progFail(result.error, { current: 1, total: 1 })
      } else {
        yield progOk(result.value, { current: 1, total: 1 })
      }
    })
  }
}
