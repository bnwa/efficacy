import type { IO } from '@lib/io'

type TaskErr = {
  ok: false
  errs: string[]
  canRetry: boolean
}

type TaskUpdate<T> = {
  ok: true
  value: T
  total: number
  current: number
}

type TaskState<T> =
  | TaskUpdate<T>
  | TaskErr

type TaskExec<T> = AsyncGenerator<TaskState<T>, void, void>

export function taskErr(canRetry: boolean, ...errs: string[]) : TaskErr {
  return { ok: false, errs, canRetry }
}

export function taskUpdate<T>(value: T, total = -1, current = -1) : TaskUpdate<T> {
  return { ok: true, value, total, current }
}

export class Task<T, TaskIO extends Partial<IO>> {
  total = -1
  current = -1
  run: typeof this.exec
  protected constructor(private init: (io: TaskIO, signal?: AbortSignal) => TaskExec<T>) {
    this.run = this.exec.bind(this)
  }

  static create<T, TaskIO extends Partial<IO>>(init: (io: TaskIO, signal?: AbortSignal) => TaskExec<T>) {
    return new Task(init)
  }

  map<U>(fn: (value: T) => U) : Task<U,TaskIO> {
    const prevTask = this.run
    return Task.create(async function*(io: TaskIO,  signal?: AbortSignal) : TaskExec<U> {
      for await (const prevState of prevTask(io, signal)) {
        if (prevState.ok) {
          const { value } = prevState
          const { total } = prevState
          const { current } = prevState
          yield taskUpdate(fn(value), total, current)
        } else {
          yield prevState
        }
      }
    })
  }

  apply<U, NextIO extends TaskIO>(nextTask: Task<(value: T) => U, NextIO>) : Task<U, NextIO> {
    const prevTask = this.run
    return Task.create(async function*(io: NextIO, signal?: AbortSignal) : TaskExec<U> {
      const nextStep = nextTask.run(io, signal)
      const nextState = await nextStep.next()
      if (nextState.done) {
        const msg = "Encountered errant execution of Task['apply']: Missing fn"
        return yield taskErr(false, msg)
      }
      const nextTaskState = nextState.value
      if (!nextTaskState.ok) {
        return yield nextTaskState
      }
      const { total } = nextTaskState
      const { current } = nextTaskState
      const { value: fn } = nextTaskState
      for await (const prevState of prevTask(io, signal)) {
        if (!prevState.ok) return yield prevState
        yield taskUpdate(fn(prevState.value), total, current)
      }
    })
  }

  flatMap<U, NextIO extends TaskIO>(fn: (x: T) => Task<U, NextIO>) : Task<U, NextIO> {
    const prevTask = this.run
    return Task.create(async function*(io: NextIO, signal?: AbortSignal) : TaskExec<U> {
      for await (const prevState of prevTask(io, signal)) {
        if (prevState.ok) {
          const next = fn(prevState.value)
          for await (const nextState of next.run(io, signal)) {
            if (nextState.ok) {
              const { value } = nextState
              const { total } = nextState
              const { current } = nextState
              yield taskUpdate(value, total, current)
            } else {
              yield nextState
            }
          }
        } else {
          yield prevState
        }
      }
    })
  }

  orElse<NextIO extends TaskIO>(fn: (tskErr: TaskErr) => Task<T, NextIO>) : Task<T, NextIO> {
    const prevTask = this.run
    return Task.create(async function*(io: NextIO, signal?: AbortSignal) : TaskExec<T> {
      for await(const prevState of prevTask(io, signal)) {
        if (prevState.ok) {
          yield prevState
        } else {
          const nextTask = fn(prevState)
          yield* nextTask.run(io, signal)
        }
      }
    })
  }

  private async* exec(io: TaskIO, signal?: AbortSignal) : TaskExec<T> {
    for await (const taskState of this.init(io, signal)) {
      if (taskState.ok) {
        this.total = taskState.total
        this.current = taskState.current
      }
      yield taskState
    }
  }

}
