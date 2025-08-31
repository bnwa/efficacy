import type { IO } from '@lib/io'

import type { Failure } from '@lib/result'
import type { Success } from '@lib/result'
import { ok as taskOk } from '@lib/result'
import { fail as taskFail } from '@lib/result'

import { Task } from '@lib/task'


export type ProgressState = {
  total?: number
  current?: number
}

export type ProgressOk<T> = Success<T> & { progress?: ProgressState }

export type ProgressFail<E> = Failure<E> & { progress?: ProgressState }

export type Progress<T, E> =
  | ProgressOk<T>
  | ProgressFail<E>

export type StreamExec<T, E> = AsyncGenerator<Progress<T, E>, void, void >

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
 * ```typescript
 * const progress = ok("completed", { total: 10, current: 5 })
 * console.log(progress) // { ok: true, value: "completed", progress: { total: 10, current: 5 } }
 * ```
 */
export function ok<T, E = never>(value: T, progress?: ProgressState) : Progress<T, E> {
  return { ok: true, value, progress }
}

/**
 * Creates a failed progress result with optional progress information.
 *
 * ```typescript
 * const progress = fail("network error", { total: 10, current: 3 })
 * console.log(progress) // { ok: false, error: "network error", progress: { total: 10, current: 3 } }
 * ```
 */
export function fail<T, E>(error: E, progress?: ProgressState) : Progress<T, E> {
  return { ok: false, error, progress }
}

/**
 * Type guard to check if a progress result represents a failure.
 *
 * ```typescript
 * const progress = fail("error")
 * if (isFailure(progress)) {
 *   console.log(progress.error) // "error"
 * }
 * ```
 */
export function isFailure<T, E>(result: Progress<T, E>) : result is ProgressFail<E> {
  return !result.ok
}


export class Stream<T, E, TaskIO extends Partial<IO>> {
  run: StreamInit<T, E, TaskIO>

  protected constructor(private init: StreamInit<T, E, TaskIO>) {
    this.run = this.init.bind(this)
  }

  /**
   * Creates a stream from an async generator function.
   *
   * ```typescript
   * const stream = Stream.create(async function*() {
   *   yield ok("step 1", { total: 3, current: 1 })
   *   yield ok("step 2", { total: 3, current: 2 })
   *   yield ok("step 3", { total: 3, current: 3 })
   * })
   * ```
   */
  static create<T, E, TaskIO extends Partial<IO>>(
    init: (io: TaskIO, signal?: AbortSignal) => StreamExec<T, E>
  ) {
    return new Stream(init)
  }

  /**
   * Creates a stream that yields a single successful value.
   *
   * ```typescript
   * const stream = Stream.const(42)
   * for await (const progress of stream.run({})) {
   *   console.log(progress) // { ok: true, value: 42, progress: { total: 1, current: 1 } }
   * }
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
   * ```typescript
   * const stream = Stream.never("error")
   * for await (const progress of stream.run({})) {
   *   console.log(progress) // { ok: false, error: "error" }
   * }
   * ```
   */
  static never<T, E>(value :E) : Stream<T, E, {}> {
    return new Stream(async function*() : StreamExec<T, E> {
      yield fail(value)
    })
  }

  /**
   * Transforms successful values using the provided function.
   *
   * ```typescript
   * const stream = Stream.const(5).map(x => x * 2)
   * const result = await runToSuccess(stream) // 10
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
   * Transforms error values using the provided function.
   *
   * ```typescript
   * const stream = Stream.never("error").mapError(err => `Handled: ${err}`)
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
   * ```typescript
   * const stream = Stream.const(5).flatMap(x => Stream.const(x * 2))
   * const result = await runToSuccess(stream) // 10
   * ```
   */
  flatMap<U, F, NextIO extends TaskIO>(
    fn: (value: T) => Stream<U, F, NextIO>
  ) : Stream<U, E | F, NextIO> {
    const prev = this.run
    return Stream.create(async function*(io: NextIO, signal?: AbortSignal): StreamExec<U, E | F> {
      for await (const result of prev(io, signal)) {
        if (result.ok) {
          const nextTask = fn(result.value)
          yield* nextTask.run(io, signal)
        } else {
          yield result
        }
      }
    })
  }

  /**
   * Converts errors to successful values using the provided function.
   *
   * ```typescript
   * const stream = Stream.never("error").orElseMap(err => `default`)
   * const result = await runToSuccess(stream) // "default"
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
   * Provides error recovery by chaining to another stream on failure.
   *
   * ```typescript
   * const stream = Stream.never("error").orElse(err => Stream.const("recovered"))
   * const result = await runToSuccess(stream) // "recovered"
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
   * ```typescript
   * const stream = Stream.const(42)
   * const task = stream.toTask()
   * const result = await task.run({}) // { ok: true, value: 42 }
   * ```
   */
  toTask() : Task<T, E, TaskIO> {
    const prev = this
    return Task.create<T, E, TaskIO>(async (io, signal) => {
      const results = await collectProgress<T, E, TaskIO>(prev, io, signal)
      const tail = results[results.length - 1]
      if (results.length === 0 || !tail) {
        throw new Error(`Progression yielded no results`)
      }
      return tail.ok ?
        taskOk(tail.value) :
        taskFail(tail.error)
    })
  }
}
