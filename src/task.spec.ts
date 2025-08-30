import { test, expect } from "bun:test"

import type { IO } from '@lib/io'

import type { Result } from '@lib/result'
import { Task } from '@lib/task'

// Custom error types for testing
type TestError = {
  message: string
  canRetry: boolean
}

type NetworkError = {
  code: number
  reason: string
}

// TypeScript assertion functions for type narrowing
function assertIsSuccess<T, E>(result: Result<T, E>): asserts result is Result<T, E> & { ok: true } {
  expect(result.ok).toBe(true)
}

function assertIsFailure<T, E>(result: Result<T, E>): asserts result is Result<T, E> & { ok: false } {
  expect(result.ok).toBe(false)
}


// Helper function to run task and get result
async function runTask<T, E, TaskIO extends Partial<IO>>(
  task: Task<T, E, TaskIO>,
  io = {} as TaskIO,
  signal?: AbortSignal
): Promise<Result<T, E>> {
  return task.run(io, signal)
}

// ============================================================================
// FUNCTOR LAWS
// ============================================================================

test('Functor identity law: task.map(x => x) ≡ task', async () => {
  const task = Task.of<number>(42)
  const mappedTask = task.map(x => x)

  const originalResult = await runTask(task)
  const mappedResult = await runTask(mappedTask)

  assertIsSuccess(originalResult)
  assertIsSuccess(mappedResult)
  expect(mappedResult.value).toBe(originalResult.value)
})

test('Functor composition law: task.map(f).map(g) ≡ task.map(x => g(f(x)))', async () => {
  const f = (x: number) => x * 2
  const g = (x: number) => x + 1

  const task = Task.of<number>(5)
  const composed1 = task.map(f).map(g)
  const composed2 = task.map(x => g(f(x)))

  const result1 = await runTask(composed1)
  const result2 = await runTask(composed2)

  assertIsSuccess(result1)
  assertIsSuccess(result2)
  expect(result1.value).toBe(result2.value)
})

test('Functor composition produces expected mathematical result', async () => {
  const f = (x: number) => x * 2
  const g = (x: number) => x + 1

  const task = Task.of<number>(5)
  const composed = task.map(f).map(g)
  const result = await runTask(composed)

  assertIsSuccess(result)
  expect(result.value).toBe(11) // (5 * 2) + 1 = 11
})

test('Map preserves errors unchanged', async () => {
  const errorTask = Task.reject<number, TestError>({ message: 'test error', canRetry: true })
  const mappedError = errorTask.map(x => x)

  const result = await runTask(mappedError)

  assertIsFailure(result)
  expect(result.error.message).toBe('test error')
  expect(result.error.canRetry).toBe(true)
})

// ============================================================================
// STATIC METHODS
// ============================================================================

test('Task.of creates task with correct success value', async () => {
  const task = Task.of<number>(42)
  const result = await runTask(task)

  assertIsSuccess(result)
  expect(result.value).toBe(42)
})

test('Task.reject creates task with correct error value', async () => {
  const task = Task.reject<string, TestError>({ message: 'test failure', canRetry: false })
  const result = await runTask(task)

  assertIsFailure(result)
  expect(result.error.message).toBe('test failure')
  expect(result.error.canRetry).toBe(false)
})

test('Task.create allows custom task implementation', async () => {
  const task = Task.create<string, never, {}>(async () => {
    return { ok: true, value: 'custom result' }
  })

  const result = await runTask(task)

  assertIsSuccess(result)
  expect(result.value).toBe('custom result')
})

// ============================================================================
// MONAD LAWS
// ============================================================================

test('Monad left identity law: Task.of(a).flatMap(f) ≡ f(a)', async () => {
  const f = (x: number) => Task.of<number>(x * 2)
  const leftIdentity1 = Task.of<number>(21).flatMap(f)
  const leftIdentity2 = f(21)

  const result1 = await runTask(leftIdentity1)
  const result2 = await runTask(leftIdentity2)

  assertIsSuccess(result1)
  assertIsSuccess(result2)
  expect(result1.value).toBe(result2.value)
})

test('Monad left identity produces expected mathematical result', async () => {
  const f = (x: number) => Task.of<number>(x * 2)
  const leftIdentity = Task.of<number>(21).flatMap(f)
  const result = await runTask(leftIdentity)

  assertIsSuccess(result)
  expect(result.value).toBe(42)
})

test('Monad right identity law: m.flatMap(Task.of) ≡ m', async () => {
  const task = Task.of<number>(42)
  const rightIdentity = task.flatMap(x => Task.of<number>(x))

  const original = await runTask(task)
  const rightResult = await runTask(rightIdentity)

  assertIsSuccess(original)
  assertIsSuccess(rightResult)
  expect(original.value).toBe(rightResult.value)
})

test('Monad associativity law: m.flatMap(f).flatMap(g) ≡ m.flatMap(x => f(x).flatMap(g))', async () => {
  const f = (x: number) => Task.of<number>(x * 2)
  const g = (x: number) => Task.of<number>(x + 1)

  const task = Task.of<number>(5)
  const assoc1 = task.flatMap(f).flatMap(g)
  const assoc2 = task.flatMap(x => f(x).flatMap(g))

  const result1 = await runTask(assoc1)
  const result2 = await runTask(assoc2)

  assertIsSuccess(result1)
  assertIsSuccess(result2)
  expect(result1.value).toBe(result2.value)
})

test('Monad associativity produces expected mathematical result', async () => {
  const f = (x: number) => Task.of<number>(x * 2)
  const g = (x: number) => Task.of<number>(x + 1)

  const task = Task.of<number>(5)
  const assoc = task.flatMap(f).flatMap(g)
  const result = await runTask(assoc)

  assertIsSuccess(result)
  expect(result.value).toBe(11) // (5 * 2) + 1 = 11
})

test('FlatMap propagates errors from source task', async () => {
  const errorTask = Task.reject<number, TestError>({ message: 'source error', canRetry: true })
  const chained = errorTask.flatMap(x => Task.of<string>(x.toString()))

  const result = await runTask(chained)

  assertIsFailure(result)
  expect(result.error.message).toBe('source error')
})

test('FlatMap propagates errors from chained task', async () => {
  const successTask = Task.of<number>(42)
  const chained = successTask.flatMap(() => Task.reject<string, NetworkError>({ code: 500, reason: 'server error' }))

  const result = await runTask(chained)

  assertIsFailure(result)
  expect(result.error.code).toBe(500)
  expect(result.error.reason).toBe('server error')
})

// ============================================================================
// ERROR HANDLING
// ============================================================================

test('MapError transforms error type correctly', async () => {
  const errorTask = Task.reject<string, TestError>({ message: 'original error', canRetry: true })
  const mappedErrorTask = errorTask.mapError(err => ({ code: 500, reason: err.message }))

  const result = await runTask(mappedErrorTask)

  assertIsFailure(result)
  expect(result.error.code).toBe(500)
})

test('MapError preserves original error data in transformation', async () => {
  const errorTask = Task.reject<string, TestError>({ message: 'original error', canRetry: true })
  const mappedErrorTask = errorTask.mapError(err => ({ code: 500, reason: err.message }))

  const result = await runTask(mappedErrorTask)

  assertIsFailure(result)
  expect(result.error.reason).toBe('original error')
})

test('MapError passes through success values unchanged', async () => {
  const successTask = Task.of<string>('success value')
  const mappedErrorTask = successTask.mapError(() => ({ code: 500, reason: 'should not be used' }))

  const result = await runTask(mappedErrorTask)

  assertIsSuccess(result)
  expect(result.value).toBe('success value')
})

test('orElse handles errors by providing recovery value', async () => {
  const failingTask = Task.reject<string, TestError>({ message: 'initial error', canRetry: true })
  const recoveryTask = Task.of<string>('recovered')
  const recoveredTask = failingTask.orElse(() => recoveryTask)

  const result = await runTask(recoveredTask)

  assertIsSuccess(result)
  expect(result.value).toBe('recovered')
})

test('orElse passes through successful values unchanged', async () => {
  const successTask = Task.of<string>('success')
  const notUsedTask = Task.of<string>('not used')
  const passedThroughTask = successTask.orElse(() => notUsedTask)

  const result = await runTask(passedThroughTask)

  assertIsSuccess(result)
  expect(result.value).toBe('success')
})

test('orElse handles chained error recovery', async () => {
  const error1 = Task.reject<string, TestError>({ message: 'error 1', canRetry: false })
  const error2 = Task.reject<string, NetworkError>({ code: 404, reason: 'not found' })
  const recovery = Task.of<string>('final recovery')

  const chainedRecovery = error1.orElse(() => error2).orElse(() => recovery)
  const result = await runTask(chainedRecovery)

  assertIsSuccess(result)
  expect(result.value).toBe('final recovery')
})

test('orElseMap converts errors to success values', async () => {
  const failingTask = Task.reject<number, TestError>({ message: 'calculation failed', canRetry: false })
  const recoveredTask = failingTask.orElseMap(_err => 42)

  const result = await runTask(recoveredTask)

  assertIsSuccess(result)
  expect(result.value).toBe(42)
})

test('orElseMap passes through successful values unchanged', async () => {
  const successTask = Task.of<number>(100)
  const passedThroughTask = successTask.orElseMap(() => 999)

  const result = await runTask(passedThroughTask)

  assertIsSuccess(result)
  expect(result.value).toBe(100)
})

// ============================================================================
// METHOD CHAINING
// ============================================================================

test('Complex method chaining produces correct mathematical result', async () => {
  const chainedTask = Task.of<number>(10)
  .map(x => x * 2)           // 20
  .flatMap(x => Task.of<number>(x + 5))  // 25
  .map(x => x / 5)           // 5

  const result = await runTask(chainedTask)

  assertIsSuccess(result)
  expect(result.value).toBe(5)
})

test('Error handling in method chains with recovery', async () => {
  const errorInChain = Task.of<number>(10)
  .map(x => x * 2)
  .flatMap(() => Task.reject<string, TestError>({ message: 'chain error', canRetry: true }))
  .orElse(() => Task.of<string>('recovered'))
  .map(x => x + ' value')

  const result = await runTask(errorInChain)

  assertIsSuccess(result)
  expect(result.value).toBe('recovered value')
})

test('Method chaining preserves type safety through transformations', async () => {
  const typedChain = Task.of<number>(42)
  .map(x => x.toString())        // number -> string
  .map(s => s.length)            // string -> number
  .flatMap(n => Task.of<boolean>(n > 0))  // number -> boolean

  const result = await runTask(typedChain)

  assertIsSuccess(result)
  expect(typeof result.value).toBe('boolean')
  expect(result.value).toBe(true)
})

// ============================================================================
// IO CONTEXT
// ============================================================================

test('Task correctly uses numeric IO context properties', async () => {
  interface TestIOBasic extends Partial<IO> {
    value?: number
  }

  const ioTask = Task.create<number, never, TestIOBasic>(async (io: TestIOBasic) => {
    return { ok: true, value: (io.value || 0) * 2 }
  })

  const ioContext: TestIOBasic = { value: 21 }
  const result = await runTask(ioTask, ioContext)

  assertIsSuccess(result)
  expect(result.value).toBe(42)
})

test('Task works with extended string IO context', async () => {
  interface TestIO extends Partial<IO> {
    testValue?: string
  }

  const extendedIOTask = Task.create<string, never, TestIO>(async (io: TestIO) => {
    return { ok: true, value: io.testValue || 'default' }
  })

  const result = await runTask(extendedIOTask, { testValue: 'custom' })

  assertIsSuccess(result)
  expect(result.value).toBe('custom')
})

test('Task handles missing IO context gracefully', async () => {
  interface TestIO extends Partial<IO> {
    optionalValue?: string
  }

  const ioTask = Task.create<string, never, TestIO>(async (io: TestIO) => {
    return { ok: true, value: io.optionalValue || 'fallback' }
  })

  const result = await runTask(ioTask, {})

  assertIsSuccess(result)
  expect(result.value).toBe('fallback')
})

// ============================================================================
// SIGNAL HANDLING
// ============================================================================

test('Task completes normally without cancellation signal', async () => {
  const cancellableTask = Task.create<string, TestError, {}>(async (_io: {}, signal?: AbortSignal) => {
    if (signal?.aborted) {
      return { ok: false, error: { message: 'Task was cancelled', canRetry: false } }
    }
    return { ok: true, value: 'completed' }
  })

  const result = await runTask(cancellableTask)

  assertIsSuccess(result)
  expect(result.value).toBe('completed')
})

test('Task structure supports AbortSignal parameter', async () => {
  const cancellableTask = Task.create<string, TestError, {}>(async (_io: {}, signal?: AbortSignal) => {
    if (signal?.aborted) {
      return { ok: false, error: { message: 'Task was cancelled', canRetry: false } }
    }
    return { ok: true, value: 'completed' }
  })

  // Verify the task can be created and has the expected structure
  expect(cancellableTask).toBeDefined()
  expect(typeof cancellableTask.run).toBe('function')
})

test('Task can handle pre-aborted signal', async () => {
  const controller = new AbortController()
  controller.abort()

  const cancellableTask = Task.create<string, TestError, {}>(async (_io: {}, signal?: AbortSignal) => {
    if (signal?.aborted) {
      return { ok: false, error: { message: 'Task was cancelled', canRetry: false } }
    }
    return { ok: true, value: 'completed' }
  })

  const result = await runTask(cancellableTask, {}, controller.signal)

  assertIsFailure(result)
  expect(result.error.message).toBe('Task was cancelled')
})

// ============================================================================
// EDGE CASES
// ============================================================================

test('Task handles synchronous success creation', async () => {
  const syncTask = Task.create<string, never, {}>(async () => {
    return { ok: true, value: 'immediate success' }
  })

  const result = await runTask(syncTask)

  assertIsSuccess(result)
  expect(result.value).toBe('immediate success')
})

test('Task handles synchronous error creation', async () => {
  const syncErrorTask = Task.create<string, TestError, {}>(async () => {
    return { ok: false, error: { message: 'immediate error', canRetry: true } }
  })

  const result = await runTask(syncErrorTask)

  assertIsFailure(result)
  expect(result.error.message).toBe('immediate error')
})

test('Task handles async computation with delay', async () => {
  const asyncTask = Task.create<number, never, {}>(async () => {
    await new Promise(resolve => setTimeout(resolve, 1)) // Small delay
    return { ok: true, value: 123 }
  })

  const result = await runTask(asyncTask)

  assertIsSuccess(result)
  expect(result.value).toBe(123)
})

test('Task properly types union error types in flatMap chains', async () => {
  const task1 = Task.reject<number, TestError>({ message: 'test error', canRetry: false })
  const task2 = Task.reject<string, NetworkError>({ code: 404, reason: 'not found' })

  const combined = task1.flatMap(() => task2)
  const result = await runTask(combined)

  assertIsFailure(result)
  // The error could be either TestError or NetworkError due to union type
  expect(result.error).toBeDefined()
})
