import type { IO } from '@lib/io'

type Success<T> = { ok: true,   value: T, progress?: Progress }
type Failure<E> = { ok: false,  error: E, progress?: Progress }

type Result<T, E> =
  | Success<T>
  | Failure<E>

type Progress = {
  total?: number
  current?: number
}

type TaskExec<T, E> = AsyncGenerator<Result<T, E>, void, void >

export function success<T>(value: T, progress?: Progress): Success<T> {
  return { ok: true, value, progress }
}

export function failure<E>(error: E, progress?: Progress) : Failure<E> {
  return { ok: false, error, progress }
}

export class Task<T, E, TaskIO extends Partial<IO>> {
  run: typeof this.exec

  protected constructor(
    private init: (io: TaskIO, signal?: AbortSignal) => TaskExec<T, E>
  ) {
    this.run = this.exec.bind(this)
  }

  static create<T, E, TaskIO extends Partial<IO>>(
    init: (io: TaskIO, signal?: AbortSignal) => TaskExec<T, E>
  ) {
    return new Task(init)
  }

  static of<T, E = never>(value: T): Task<T, E, {}> {
    return new Task(async function*() : TaskExec<T,E> {
      yield success(value, { total: 1, current: 1 })
    })
  }

  static never<T, E>(value :E) : Task<T, E, {}> {
    return new Task(async function*() : TaskExec<T,E> {
      yield failure(value)
    })
  }

  map<U>(fn: (value: T) => U): Task<U, E, TaskIO> {
    const prevTask = this.run
    return Task.create(async function*(io: TaskIO, signal?: AbortSignal): TaskExec<U, E> {
      for await (const result of prevTask(io, signal)) {
        if (result.ok) {
          yield success(fn(result.value), result.progress)
        } else {
          yield result
        }
      }
    })
  }

  mapError<F>(fn: (error: E) => F): Task<T, F, TaskIO> {
    const prevTask = this.run
    return Task.create(async function*(io: TaskIO, signal?: AbortSignal): TaskExec<T, F> {
      for await (const result of prevTask(io, signal)) {
        if (result.ok) {
          yield result
        } else {
          yield failure(fn(result.error), result.progress)
        }
      }
    })
  }

  flatMap<U, F, NextIO extends TaskIO>(
    fn: (value: T) => Task<U, F, NextIO>
  ): Task<U, E | F, NextIO> {
    const prevTask = this.run
    return Task.create(async function*(io: NextIO, signal?: AbortSignal): TaskExec<U, E | F> {
      for await (const result of prevTask(io, signal)) {
        if (result.ok) {
          const nextTask = fn(result.value)
          yield* nextTask.run(io, signal)
        } else {
          yield result
        }
      }
    })
  }

  orElseMap(fn: (error: E) => T): Task<T, never, TaskIO> {
    const prevTask = this.run
    return Task.create(async function*(io: TaskIO, signal?: AbortSignal): TaskExec<T, never> {
      for await (const state of prevTask(io, signal)) {
        if (state.ok) {
          yield state
        } else {
          yield success(fn(state.error), state.progress)
        }
      }
    })
  }

  orElse<F, NextIO extends TaskIO>(
    fn: (error: E) => Task<T, F, NextIO>
  ): Task<T, F, NextIO> {
    const prevTask = this.run
    return Task.create(async function*(io: NextIO, signal?: AbortSignal): TaskExec<T, F> {
      for await (const state of prevTask(io, signal)) {
        if (state.ok) {
          yield state
        } else {
          const next = fn(state.error)
          yield* next.run(io, signal)
        }
      }
    })
  }

  private async* exec(io: TaskIO, signal?: AbortSignal): TaskExec<T, E> {
    yield* this.init(io, signal)
  }

}
