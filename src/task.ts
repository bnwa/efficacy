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

  static create<T, E, TaskIO extends Partial<IO>>(init: TaskInit<T, E, TaskIO>) {
    return new Task(init)
  }
  static of<T, E = never>(value: T): Task<T, E, {}> {
    return new Task(async () => ok(value))
  }
  static reject<T, E>(error: E): Task<T, E, {}> {
    return new Task(async () => fail(error))
  }

  map<U>(fn: (value: T) => U): Task<U, E, TaskIO> {
    const prev = this.run
    return Task.create(async (io, signal) => {
      const result = await prev(io, signal)
      return isFailure(result) ?
        result :
        ok(fn(result.value))
    })
  }

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

  mapError<F>(fn: (error: E) => F): Task<T, F, TaskIO> {
    const prev = this.run
    return Task.create(async (io, signal) => {
      const result = await prev(io, signal)
      return isFailure(result) ?
        { ok: false, error: fn(result.error) } :
        result
    })
  }

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

  orElseMap(fn: (error: E) => T) : Task<T, E, TaskIO> {
    const prev = this.run
    return Task.create(async (io, signal) : Promise<Result<T, E>> => {
      const result = await prev(io, signal)
      if (!isFailure(result)) return result
      else return ok(fn(result.error))
    })
  }

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
