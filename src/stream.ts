/**
 * @module
 *
 * Progress-aware asynchronous operations with typed IO dependencies.
 *
 * The `Stream<T, E, TaskIO>` type represents an asynchronous operation that yields multiple
 * progress updates during execution. Each progress update can be a success or failure, and
 * includes optional progress tracking with `{ current, total }` information. Streams are
 * ideal for long-running operations like file uploads, data processing, or multi-step workflows.
 *
 * ```typescript
 * import { Stream, ok as progressOk, fail as progressFail } from 'efficacy/stream'
 *
 * // Create a stream with progress updates
 * const progressStream: Stream<string, never, {}> = Stream.create(async function*() {
 *   yield progressOk('step 1', { total: 3, current: 1 })
 *   yield progressOk('step 2', { total: 3, current: 2 })
 *   yield progressOk('step 3', { total: 3, current: 3 })
 * })
 *
 * // Consume progress updates
 * for await (const progress of progressStream.run({})) {
 *   if (progress.ok) {
 *     console.log(`Success: ${progress.value}`, progress.progress)
 *   } else {
 *     console.log(`Error: ${progress.error}`)
 *   }
 * }
 *
 * // Streams support monadic operations
 * const pipeline = Stream.const(10)
 *   .map(x => x * 2)                    // Stream<number, never, {}>
 *   .flatMap(x => Stream.const(x + 5))  // Stream<number, never, {}>
 *   .orElse(err => Stream.const(0))     // Error recovery
 *
 * // Convert between Task and Stream
 * const task = Task.of('hello')
 * const stream = task.toStream()      // Task -> Stream
 * const backToTask = stream.toTask()  // Stream -> Task
 * ```
 */

import type { IO } from './io.js'

import type { Failure } from './result.js'
import type { Success } from './result.js'
import { ok as taskOk } from './result.js'
import { fail as taskFail } from './result.js'

import { Task } from './task.js'


/**
 * Represents progress tracking information for streaming operations.
 *
 * This optional metadata provides context about the current position in a
 * multi-step operation, enabling progress bars and completion percentage calculations.
 *
 * @example
 * ```typescript
 * const progressInfo: ProgressState = { total: 100, current: 45 }
 * const percentage = Math.round((progressInfo.current / progressInfo.total) * 100) // 45%
 * ```
 */
export type ProgressState = {
  /** Total number of steps/items in the operation */
  total?: number
  /** Current step/item being processed */
  current?: number
}

/**
 * Represents a successful progress update containing a value and optional progress information.
 *
 * This extends the basic Success type with progress metadata, allowing streaming operations
 * to report both their current result and their position in the overall workflow.
 *
 * @template T The type of the success value
 */
export type ProgressOk<T> = Success<T> & { progress?: ProgressState }

/**
 * Represents a failed progress update containing an error and optional progress information.
 *
 * This extends the basic Failure type with progress metadata, allowing streaming operations
 * to report failures while maintaining context about where in the workflow the failure occurred.
 *
 * @template E The type of the error value
 */
export type ProgressFail<E> = Failure<E> & { progress?: ProgressState }

/**
 * A discriminated union representing either successful or failed progress updates.
 *
 * This is the fundamental type emitted by Streams during execution. Each progress update
 * can be either a success or failure state, with optional progress tracking information.
 * The `ok` property acts as a type discriminator for safe pattern matching.
 *
 * @template T The type of success values
 * @template E The type of error values
 *
 * @example
 * ```typescript
 * const handleProgress = (progress: Progress<string, Error>) => {
 *   if (progress.ok) {
 *     console.log('Success:', progress.value)
 *     if (progress.progress) {
 *       const pct = Math.round((progress.progress.current / progress.progress.total) * 100)
 *       console.log(`Progress: ${pct}%`)
 *     }
 *   } else {
 *     console.log('Error:', progress.error.message)
 *   }
 * }
 * ```
 */
export type Progress<T, E> =
  | ProgressOk<T>
  | ProgressFail<E>

/**
 * AsyncGenerator type that yields Progress updates for streaming operations.
 *
 * This represents the execution context of a Stream, yielding multiple progress
 * updates over time before completing. Used internally by Stream implementations.
 *
 * @template T The type of success values in progress updates
 * @template E The type of error values in progress updates
 */
export type StreamExec<T, E> = AsyncGenerator<Progress<T, E>, void, void >

/**
 * Function signature for initializing a Stream with IO dependencies and optional cancellation.
 *
 * This type defines the shape of functions that create Stream instances. Streams execute
 * immediately when `.run()` is called, yielding progress updates through an async generator.
 *
 * @template T The type of success values in progress updates
 * @template E The type of error values in progress updates
 * @template TaskIO The IO operations required by this stream
 *
 * @param io IO operations object containing the dependencies needed by the stream
 * @param signal Optional AbortSignal for cancellation support
 * @returns AsyncGenerator that yields Progress updates
 */
export type StreamInit<T, E, TaskIO extends Partial<IO>> =
  (io: TaskIO, signal?: AbortSignal) => StreamExec<T, E>


async function collectProgress<T, E, TaskIO extends Partial<IO>>(
  stream: Stream<T, E, TaskIO>,
  io: TaskIO,
  signal?: AbortSignal
) : Promise<Progress<T, E>[]> {
  const results = []
  for await (const result of stream.run(io, signal)) {
    results.push(result)
  }
  return results
}

/**
 * Creates a successful progress result with optional progress information.
 *
 * This is the primary constructor for successful progress updates in streaming operations.
 * Use this when an operation step completes successfully and you want to report both
 * the result and optionally the current progress position.
 *
 * @template T The type of the success value
 * @template E The type of potential errors (defaults to never since this creates success)
 * @param value The successful value to report
 * @param progress Optional progress tracking information
 * @returns A ProgressOk result containing the value and progress information
 *
 * @example
 * ```typescript
 * const progress = ok("Step 1 completed", { total: 10, current: 1 })
 * console.log(progress) // { ok: true, value: "Step 1 completed", progress: { total: 10, current: 1 } }
 *
 * // Without progress information
 * const simpleSuccess = ok("Task finished")
 *
 * // Use in stream generators
 * async function* processItems(items: string[]) {
 *   for (let i = 0; i < items.length; i++) {
 *     const processed = await processItem(items[i])
 *     yield ok(processed, { total: items.length, current: i + 1 })
 *   }
 * }
 * ```
 */
export function ok<T, E = never>(value: T, progress?: ProgressState) : Progress<T, E> {
  return { ok: true, value, progress }
}

/**
 * Creates a failed progress result with optional progress information.
 *
 * This is the primary constructor for failed progress updates in streaming operations.
 * Use this when an operation step fails and you want to report both the error and
 * optionally the current progress position where the failure occurred.
 *
 * @template T The type of potential success values
 * @template E The type of the error value
 * @param error The error information to report
 * @param progress Optional progress tracking information indicating where the failure occurred
 * @returns A ProgressFail result containing the error and progress information
 *
 * @example
 * ```typescript
 * const progress = fail("Network timeout", { total: 10, current: 3 })
 * console.log(progress) // { ok: false, error: "Network timeout", progress: { total: 10, current: 3 } }
 *
 * // Without progress information
 * const simpleError = fail(new Error("Processing failed"))
 *
 * // Use in stream generators for error reporting
 * async function* uploadFiles(files: File[]) {
 *   for (let i = 0; i < files.length; i++) {
 *     try {
 *       const result = await uploadFile(files[i])
 *       yield ok(result, { total: files.length, current: i + 1 })
 *     } catch (error) {
 *       yield fail(error, { total: files.length, current: i + 1 })
 *       return // Stop on first error
 *     }
 *   }
 * }
 * ```
 */
export function fail<T, E>(error: E, progress?: ProgressState) : Progress<T, E> {
  return { ok: false, error, progress }
}

/**
 * Type guard to check if a progress result represents a failure.
 *
 * This function provides type-safe checking for Progress values, narrowing the TypeScript
 * type to ProgressFail<E> when the check passes. This enables safe access to the error
 * property without additional type assertions.
 *
 * @template T The type of potential success values
 * @template E The type of the error value
 * @param result The Progress value to check
 * @returns True if the progress represents a failure, false if it's a success
 *
 * @example
 * ```typescript
 * const progress = fail("connection error")
 * if (isFailure(progress)) {
 *   console.log('Error occurred:', progress.error) // TypeScript knows this is the error type
 *   if (progress.progress) {
 *     console.log(`Failed at step ${progress.progress.current} of ${progress.progress.total}`)
 *   }
 * } else {
 *   console.log('Success:', progress.value) // TypeScript knows this is the success type
 * }
 *
 * // Use in progress handling
 * for await (const progress of stream.run(io)) {
 *   if (isFailure(progress)) {
 *     console.error('Stream failed:', progress.error)
 *     break
 *   }
 *   updateProgressBar(progress.progress)
 * }
 * ```
 */
export function isFailure<T, E>(result: Progress<T, E>) : result is ProgressFail<E> {
  return !result.ok
}


/**
 * Represents a progress-aware asynchronous operation with typed IO dependencies.
 *
 * The Stream type represents a long-running asynchronous operation that can emit multiple
 * progress updates before completing. Each update can be either a success or failure state,
 * making it ideal for operations like file uploads, data processing, or multi-step workflows.
 *
 * Streams support:
 * - Multiple progress updates during execution
 * - Optional progress tracking with current/total information
 * - Monadic composition with `map`, `flatMap`, and error handling
 * - Cancellation through AbortSignal
 * - Type-safe IO requirements specification
 * - Conversion to/from Tasks for interoperability
 *
 * @template T The type of success values in progress updates
 * @template E The type of error values in progress updates
 * @template TaskIO The IO operations required by this stream (subset of IO)
 *
 * @example
 * ```typescript
 * // Create a stream with progress updates
 * const progressStream: Stream<string, never, {}> = Stream.create(async function*() {
 *   yield ok('step 1', { total: 3, current: 1 })
 *   yield ok('step 2', { total: 3, current: 2 })
 *   yield ok('step 3', { total: 3, current: 3 })
 * })
 *
 * // Consume progress updates
 * for await (const progress of progressStream.run({})) {
 *   if (progress.ok) {
 *     console.log(`Success: ${progress.value}`, progress.progress)
 *   } else {
 *     console.log(`Error: ${progress.error}`)
 *   }
 * }
 *
 * // Compose streams with monadic operations
 * const pipeline = Stream.const(10)
 *   .map(x => x * 2)
 *   .flatMap(x => Stream.const(x + 5))
 *   .orElse(err => Stream.const(0))
 * ```
 */
export class Stream<T, E, TaskIO extends Partial<IO>> {
  run: StreamInit<T, E, TaskIO>

  protected constructor(private init: StreamInit<T, E, TaskIO>) {
    this.run = this.init.bind(this)
  }

  /**
   * Creates a stream from an async generator function.
   *
   * This is the primary constructor for custom streams that need to emit multiple progress
   * updates over time. Use this for complex streaming operations like file processing,
   * data transformation pipelines, or any multi-step workflow that benefits from progress reporting.
   *
   * @template T The type of success values in progress updates
   * @template E The type of error values in progress updates
   * @template TaskIO The IO operations required by this stream
   * @param init Async generator function that defines the stream's behavior
   * @returns A new Stream instance
   *
   * @example
   * ```typescript
   * const processFiles = Stream.create<ProcessedFile, Error, Pick<MyIO, 'filesystem'>>(
   *   async function*(io, signal) {
   *     const files = await io.filesystem.listFiles('./input')
   *
   *     for (let i = 0; i < files.length; i++) {
   *       if (signal?.aborted) return
   *
   *       try {
   *         const content = await io.filesystem.readFile(files[i])
   *         const processed = processFileContent(content)
   *         yield ok(processed, { total: files.length, current: i + 1 })
   *       } catch (error) {
   *         yield fail(error, { total: files.length, current: i + 1 })
   *         return
   *       }
   *     }
   *   }
   * )
   * ```
   */
  static create<T, E, TaskIO extends Partial<IO>>(
    init: (io: TaskIO, signal?: AbortSignal) => StreamExec<T, E>
  ) : Stream<T, E, TaskIO> {
    return new Stream(init)
  }

  /**
   * Creates a stream that yields a single successful value.
   *
   * This is useful for converting single values into the streaming context or creating
   * simple streams that emit one success result. The progress information is automatically
   * set to `{ total: 1, current: 1 }`.
   *
   * @template T The type of the success value
   * @template E The type of potential errors (defaults to never since this always succeeds)
   * @param value The value to emit as a single progress update
   * @returns A Stream that emits one successful progress update
   *
   * @example
   * ```typescript
   * const stream = Stream.const(42)
   * for await (const progress of stream.run({})) {
   *   console.log(progress) // { ok: true, value: 42, progress: { total: 1, current: 1 } }
   * }
   *
   * // Use to convert values into streaming workflows
   * const pipeline = Stream.const("initial value")
   *   .flatMap(value => processAsStream(value))
   *   .map(result => finalTransform(result))
   *
   * // Useful for starting stream chains
   * const workflow = Stream.const(configuration)
   *   .flatMap(config => loadDataStream(config))
   *   .flatMap(data => processDataStream(data))
   * ```
   */
  static const<T, E = never>(value: T): Stream<T, E, {}> {
    return new Stream(async function*() : StreamExec<T, E> {
      yield ok(value, { total: 1, current: 1 })
    })
  }

  /**
   * Creates a stream that yields a single error value.
   *
   * This is useful for error conditions in streaming workflows or testing failure scenarios.
   * The stream emits one failure update and completes.
   *
   * @template T The type of potential success values
   * @template E The type of the error value
   * @param error The error to emit as a single failure progress update
   * @returns A Stream that emits one failed progress update
   *
   * @example
   * ```typescript
   * const stream = Stream.never("Something went wrong")
   * for await (const progress of stream.run({})) {
   *   console.log(progress) // { ok: false, error: "Something went wrong" }
   * }
   *
   * // Use for conditional error paths
   * const conditionalStream = condition
   *   ? Stream.const(successValue)
   *   : Stream.never("Condition not met")
   *
   * // Error handling in stream composition
   * const robustStream = primaryDataStream()
   *   .orElse(err => fallbackDataStream())
   *   .orElse(err => Stream.never("All data sources failed"))
   * ```
   */
  static never<T, E>(error: E) : Stream<T, E, {}> {
    return new Stream(async function*() : StreamExec<T, E> {
      yield fail(error)
    })
  }

  /**
   * Transforms successful values using the provided function.
   *
   * This transformation is applied to each successful progress update individually.
   * Error values and progress metadata pass through unchanged, preserving the
   * streaming behavior and failure information.
   *
   * @template U The type of the transformed values
   * @param fn Function to transform successful progress values
   * @returns A new Stream with transformed success values
   *
   * @example
   * ```typescript
   * const numbers = Stream.create(async function*() {
   *   yield ok(1, { total: 3, current: 1 })
   *   yield ok(2, { total: 3, current: 2 })
   *   yield ok(3, { total: 3, current: 3 })
   * })
   *
   * const doubled = numbers.map(x => x * 2)
   * for await (const progress of doubled.run({})) {
   *   console.log(progress.value) // 2, 4, 6
   *   console.log(progress.progress) // Progress metadata preserved
   * }
   *
   * // Errors pass through unchanged
   * const mixed = Stream.create(async function*() {
   *   yield ok(5, { current: 1, total: 2 })
   *   yield fail("error", { current: 2, total: 2 })
   * })
   *
   * const processed = mixed.map(x => x * 10)
   * // First update: { ok: true, value: 50, progress: { current: 1, total: 2 } }
   * // Second update: { ok: false, error: "error", progress: { current: 2, total: 2 } }
   * ```
   */
  map<U>(fn: (value: T) => U): Stream<U, E, TaskIO> {
    const prev = this.run
    return Stream.create(async function*(io: TaskIO, signal?: AbortSignal): StreamExec<U, E> {
      for await (const result of prev(io, signal)) {
        if (result.ok) {
          yield ok(fn(result.value), result.progress)
        } else {
          yield result
        }
      }
    })
  }

  /**
   * Transforms error values while leaving successful values and progress metadata unchanged.
   *
   * Use this to convert between different error types, add context to errors, or
   * normalize error formats across your streaming operations. Success values pass
   * through unchanged.
   *
   * @template F The new error type after transformation
   * @param fn Function to transform error values
   * @returns A new Stream with transformed error types
   *
   * @example
   * ```typescript
   * type NetworkError = { code: number; message: string }
   * type AppError = { type: string; details: string; timestamp: Date }
   *
   * const networkStream = Stream.create<string, NetworkError, {}>(async function*() {
   *   yield ok("success", { current: 1, total: 2 })
   *   yield fail({ code: 404, message: "Not Found" }, { current: 2, total: 2 })
   * })
   *
   * const appStream = networkStream.mapError((err: NetworkError) => ({
   *   type: 'NETWORK_ERROR',
   *   details: `${err.code}: ${err.message}`,
   *   timestamp: new Date()
   * } as AppError))
   *
   * // Success values pass through: { ok: true, value: "success", progress: {...} }
   * // Error values transformed: { ok: false, error: { type: 'NETWORK_ERROR', ... }, progress: {...} }
   * ```
   */
  mapError<F>(fn: (error: E) => F): Stream<T, F, TaskIO> {
    const prev = this.run
    return Stream.create(async function*(io: TaskIO, signal?: AbortSignal): StreamExec<T, F> {
      for await (const result of prev(io, signal)) {
        if (result.ok) {
          yield result
        } else {
          yield fail(fn(result.error), result.progress)
        }
      }
    })
  }

  /**
   * Chains streams together, flattening the results.
   *
   * For each successful value, the function returns a new stream whose updates are
   * flattened into the result stream. Error values pass through unchanged. This enables
   * complex streaming workflows where each step can produce multiple progress updates.
   *
   * @template U The success type of the next stream
   * @template F The error type of the next stream
   * @template NextIO The IO requirements of the next stream
   * @param fn Function that receives successful values and returns a new stream
   * @returns A new Stream with combined error types and next IO requirements
   *
   * @example
   * ```typescript
   * const fetchAndProcess = Stream.const(['file1.txt', 'file2.txt'])
   *   .flatMap(filenames => Stream.create<ProcessedFile, Error, FileIO>(async function*(io) {
   *     for (let i = 0; i < filenames.length; i++) {
   *       try {
   *         yield ok('Reading...', { total: filenames.length * 2, current: i * 2 + 1 })
   *         const content = await io.readFile(filenames[i])
   *
   *         yield ok('Processing...', { total: filenames.length * 2, current: i * 2 + 2 })
   *         const processed = await processContent(content)
   *
   *         yield ok(processed, { total: filenames.length * 2, current: i * 2 + 2 })
   *       } catch (error) {
   *         yield fail(error, { total: filenames.length * 2, current: i * 2 + 1 })
   *         return
   *       }
   *     }
   *   }))
   *
   * // Results in flattened stream of all processing updates
   * ```
   */
  flatMap<U, F, NextIO extends TaskIO>(
    fn: (value: T) => Stream<U, F, NextIO>
  ) : Stream<U, E | F, NextIO> {
    const prev = this.run
    return Stream.create(async function*(io: NextIO, signal?: AbortSignal): StreamExec<U, E | F> {
      for await (const result of prev(io, signal)) {
        if (result.ok) {
          const nextStream = fn(result.value)
          yield* nextStream.run(io, signal)
        } else {
          yield result
        }
      }
    })
  }

  /**
   * Directly converts error updates to success updates using a synchronous function.
   *
   * This creates an infallible stream (`Stream<T, never, TaskIO>`) that cannot emit errors.
   * Use this when you have a reasonable default value for any error condition and want
   * to ensure the stream never fails.
   *
   * @param fn Function that converts error values to success values
   * @returns A Stream that cannot fail (error type is never)
   *
   * @example
   * ```typescript
   * const robustStream = unreliableDataStream()
   *   .orElseMap(error => {
   *     console.log('Stream error, using fallback:', error)
   *     return fallbackValue
   *   })
   *
   * // robustStream has type Stream<T, never, TaskIO> - it cannot fail!
   * for await (const progress of robustStream.run(io)) {
   *   // progress.ok is always true
   *   console.log('Value:', progress.value)
   * }
   *
   * // Common pattern: provide defaults for missing data
   * const configStream = loadConfigStream()
   *   .orElseMap(error => DEFAULT_CONFIG)
   *
   * // Progress information is preserved
   * const safeProcessing = riskyProcessingStream()
   *   .orElseMap(error => ({
   *     status: 'failed',
   *     error: error.message,
   *     fallbackData: null
   *   }))
   * ```
   */
  orElseMap(fn: (error: E) => T): Stream<T, never, TaskIO> {
    const prev = this.run
    return Stream.create(async function*(io: TaskIO, signal?: AbortSignal): StreamExec<T, never> {
      for await (const state of prev(io, signal)) {
        if (state.ok) {
          yield state
        } else {
          yield ok(fn(state.error), state.progress)
        }
      }
    })
  }

  /**
   * Provides error recovery by chaining to another stream when an error update occurs.
   *
   * When an error update is encountered, the recovery function returns a replacement
   * stream whose updates continue the original stream. Success updates pass through
   * unchanged. This enables sophisticated error handling and fallback strategies
   * in streaming workflows.
   *
   * @template F The error type of the recovery stream
   * @template NextIO The IO requirements of the recovery stream
   * @param fn Function that receives errors and returns a recovery stream
   * @returns A new Stream that cannot fail with the original error type
   *
   * @example
   * ```typescript
   * const resilientStream = primaryDataStream()
   *   .orElse(primaryError => {
   *     console.log('Primary failed, trying secondary:', primaryError)
   *     return secondaryDataStream()
   *   })
   *   .orElse(secondaryError => {
   *     console.log('Secondary failed, trying cache:', secondaryError)
   *     return cacheDataStream()
   *   })
   *   .orElse(cacheError => {
   *     console.log('All sources failed, using empty stream')
   *     return Stream.const(null)
   *   })
   *
   * // Multiple fallback strategies with different error types
   * const robustProcessing = Stream.create<Data, NetworkError, NetworkIO>(networkFetch)
   *   .orElse((netErr: NetworkError) => Stream.create<Data, CacheError, CacheIO>(cacheFetch))
   *   .orElse((cacheErr: CacheError) => Stream.const(DEFAULT_DATA))
   *
   * // Error types are combined: NetworkError | CacheError
   * // IO requirements are combined: NetworkIO & CacheIO
   * ```
   */
  orElse<F, NextIO extends TaskIO>(
    fn: (error: E) => Stream<T, F, NextIO>
  ) : Stream<T, F, NextIO> {
    const prev = this.run
    return Stream.create(async function*(io: NextIO, signal?: AbortSignal): StreamExec<T, F> {
      for await (const state of prev(io, signal)) {
        if (state.ok) {
          yield state
        } else {
          const next = fn(state.error)
          yield* next.run(io, signal)
        }
      }
    })
  }

  /**
   * Converts the stream to a Task by collecting all progress and returning the final result.
   *
   * This is useful when you only care about the end result of a streaming operation and
   * want to integrate it with Task-based workflows. The task will complete with the last
   * progress update from the stream.
   *
   * @returns A Task that resolves to the final progress result
   * @throws Error if the stream yields no progress updates
   *
   * @example
   * ```typescript
   * const stream = Stream.create(async function*() {
   *   yield ok('processing...', { current: 1, total: 3 })
   *   yield ok('almost done...', { current: 2, total: 3 })
   *   yield ok('completed!', { current: 3, total: 3 })
   * })
   *
   * const task = stream.toTask()
   * const result = await task.run({})
   * console.log(result) // { ok: true, value: 'completed!' }
   *
   * // Convert streaming upload to simple task result
   * const uploadTask = uploadFileStream(file).toTask()
   * const uploadResult = await uploadTask.run(ioOperations)
   *
   * // Use in Task-based pipelines
   * const pipeline = prepareDataTask
   *   .flatMap(data => processDataStream(data).toTask())
   *   .flatMap(result => saveResultTask(result))
   *
   * // Error handling - task fails with last error from stream
   * const failingStream = Stream.create(async function*() {
   *   yield ok('step 1')
   *   yield fail('something went wrong')
   * })
   *
   * const task = failingStream.toTask()
   * const result = await task.run({}) // { ok: false, error: 'something went wrong' }
   * ```
   */
  toTask() : Task<T, E, TaskIO> {
    const prev = this
    return Task.create<T, E, TaskIO>(async (io, signal) => {
      const results = await collectProgress<T, E, TaskIO>(prev, io, signal)
      const tail = results[results.length - 1]
      if (results.length === 0 || !tail) {
        throw new Error(`Stream yielded no progress updates`)
      }
      return tail.ok ?
        taskOk(tail.value) :
        taskFail(tail.error)
    })
  }
}
