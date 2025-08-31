import type { IO } from '@lib/io'

import { Stream } from '@lib/stream'
import { ok as progOk } from '@lib/stream'
import { fail as progFail } from '@lib/stream'

import type { Failure } from '@lib/result'
import type { Result } from '@lib/result'
import { ok } from '@lib/result'
import { fail } from '@lib/result'
import { isFailure } from '@lib/result'


type TaskInit<T, E, TaskIO extends Partial<IO>> =
  (io: TaskIO, signal?: AbortSignal) => Promise<Result<T, E>>


export class Task<T, E, TaskIO extends Partial<IO>> {
  run: TaskInit<T, E, TaskIO>
  protected constructor(init: TaskInit<T, E, TaskIO>) {
    this.run = init.bind(this)
  }

  /**
   * Creates a task from an async function.
   *
   * ```typescript
   * const task = Task.create(async () => {
   *   const result = await fetch('/api/data')
   *   return { ok: true, value: result.json() }
   * })
   * ```
   */
  static create<T, E, TaskIO extends Partial<IO>>(init: TaskInit<T, E, TaskIO>) {
    return new Task(init)
  }

  /**
   * Creates a task that succeeds with the given value.
   *
   * ```typescript
   * const task = Task.of(42)
   * const result = await task.run({}) // { ok: true, value: 42 }
   * ```
   */
  static of<T, E = never>(value: T): Task<T, E, {}> {
    return new Task(async () => ok(value))
  }

  /**
   * Creates a task that fails with the given error.
   *
   * ```typescript
   * const task = Task.reject("error")
   * const result = await task.run({}) // { ok: false, error: "error" }
   * ```
   */
  static reject<T, E>(error: E): Task<T, E, {}> {
    return new Task(async () => fail(error))
  }

  /**
   * Transforms successful values using the provided function.
   *
   * ```typescript
   * const task = Task.of(5).map(x => x * 2)
   * const result = await task.run({}) // { ok: true, value: 10 }
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
   * Chains tasks together, flattening the results.
   *
   * ```typescript
   * const task = Task.of(5).flatMap(x => Task.of(x * 2))
   * const result = await task.run({}) // { ok: true, value: 10 }
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
   * Transforms error values using the provided function.
   *
   * ```typescript
   * const task = Task.reject("error").mapError(err => `Handled: ${err}`)
   * const result = await task.run({}) // { ok: false, error: "Handled: error" }
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
   * Provides error recovery by chaining to another task on failure.
   *
   * ```typescript
   * const task = Task.reject("error").orElse(err => Task.of("recovered"))
   * const result = await task.run({}) // { ok: true, value: "recovered" }
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
   * Converts errors to successful values using the provided function.
   *
   * ```typescript
   * const task = Task.reject("error").orElseMap(err => "default")
   * const result = await task.run({}) // { ok: true, value: "default" }
   * ```
   */
  orElseMap(fn: (error: E) => T) : Task<T, E, TaskIO> {
    const prev = this.run
    return Task.create(async (io, signal) : Promise<Result<T, E>> => {
      const result = await prev(io, signal)
      if (!isFailure(result)) return result
      else return ok(fn(result.error))
    })
  }

  /**
   * Converts the task to a Stream that yields the result as progress.
   *
   * ```typescript
   * const task = Task.of(42)
   * const stream = task.toStream()
   * for await (const progress of stream.run({})) {
   *   console.log(progress) // { ok: true, value: 42, progress: { current: 1, total: 1 } }
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
