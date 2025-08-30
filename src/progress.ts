import type { IO } from '@lib/io'

import { ok as taskOk } from '@lib/result'
import { fail as taskFail } from '@lib/result'

import type { ProgressResult } from '@lib/prog-result'
import { ok } from '@lib/prog-result'
import { fail } from '@lib/prog-result'

import { Task } from '@lib/task'

export type StreamExec<T, E> = AsyncGenerator<ProgressResult<T, E>, void, void >

export type StreamInit<T, E, TaskIO extends Partial<IO>> =
  (io: TaskIO, signal?: AbortSignal) => StreamExec<T, E>


async function collectResults<T, E, TaskIO extends Partial<IO>>(
  stream: Progression<T, E, TaskIO>,
  io: TaskIO,
  signal?: AbortSignal
) : Promise<ProgressResult<T, E>[]> {
  const results = []
  for await (const result of stream.run(io, signal)) {
    results.push(result)
  }
  return results
}


export class Progression<T, E, TaskIO extends Partial<IO>> {
  run: StreamInit<T, E, TaskIO>

  protected constructor(private init: StreamInit<T,E,TaskIO>) {
    this.run = this.init.bind(this)
  }

  static create<T, E, TaskIO extends Partial<IO>>(
    init: (io: TaskIO, signal?: AbortSignal) => StreamExec<T, E>
  ) {
    return new Progression(init)
  }

  static const<T, E = never>(value: T): Progression<T, E, {}> {
    return new Progression(async function*() : StreamExec<T,E> {
      yield ok(value, { total: 1, current: 1 })
    })
  }

  static never<T, E>(value :E) : Progression<T, E, {}> {
    return new Progression(async function*() : StreamExec<T,E> {
      yield fail(value)
    })
  }

  map<U>(fn: (value: T) => U): Progression<U, E, TaskIO> {
    const prev = this.run
    return Progression.create(async function*(io: TaskIO, signal?: AbortSignal): StreamExec<U, E> {
      for await (const result of prev(io, signal)) {
        if (result.ok) {
          yield ok(fn(result.value), result.progress)
        } else {
          yield result
        }
      }
    })
  }

  mapError<F>(fn: (error: E) => F): Progression<T, F, TaskIO> {
    const prev = this.run
    return Progression.create(async function*(io: TaskIO, signal?: AbortSignal): StreamExec<T, F> {
      for await (const result of prev(io, signal)) {
        if (result.ok) {
          yield result
        } else {
          yield fail(fn(result.error), result.progress)
        }
      }
    })
  }

  flatMap<U, F, NextIO extends TaskIO>(
    fn: (value: T) => Progression<U, F, NextIO>
  ): Progression<U, E | F, NextIO> {
    const prev = this.run
    return Progression.create(async function*(io: NextIO, signal?: AbortSignal): StreamExec<U, E | F> {
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

  orElseMap(fn: (error: E) => T): Progression<T, never, TaskIO> {
    const prev = this.run
    return Progression.create(async function*(io: TaskIO, signal?: AbortSignal): StreamExec<T, never> {
      for await (const state of prev(io, signal)) {
        if (state.ok) {
          yield state
        } else {
          yield ok(fn(state.error), state.progress)
        }
      }
    })
  }

  orElse<F, NextIO extends TaskIO>(
    fn: (error: E) => Progression<T, F, NextIO>
  ): Progression<T, F, NextIO> {
    const prev = this.run
    return Progression.create(async function*(io: NextIO, signal?: AbortSignal): StreamExec<T, F> {
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

  toTask() : Task<T, E, TaskIO> {
    const prev = this
    return Task.create<T, E, TaskIO>(async (io, signal) => {
      const results = await collectResults<T, E, TaskIO>(prev, io, signal)
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
