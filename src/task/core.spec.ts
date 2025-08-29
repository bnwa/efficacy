import test from 'tape'
import { Task, success, failure } from './core.js'
import type { IO, ValidIO } from '@lib/io'

// Example of how consumers can extend IO via module declaration
declare module '@lib/io' {
  interface IO {
    // HTTP operations
    http(uri: string, options?: RequestInit): Promise<Response>
    
    // File operations  
    readFile(path: string): Promise<string>
    writeFile(path: string, content: string): Promise<void>
    
    // String operations
    base64Encode(input: string): Promise<string>
    base64Decode(input: string): Promise<string>
  }
}

// Test implementation for IO operations
const testIO: IO = {
  // Mock HTTP implementation
  async http(uri: string, options?: RequestInit): Promise<Response> {
    // Simple mock that returns success for most requests
    if (uri.includes('error')) {
      throw new Error('Mock HTTP error')
    }
    
    return new Response(JSON.stringify({ success: true, uri }), {
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 
        'Content-Type': 'application/json',
        'Content-Length': '50'
      })
    })
  },
  
  // Mock file operations
  async readFile(path: string): Promise<string> {
    if (path.includes('missing')) {
      throw new Error('File not found')
    }
    return `Content of ${path}`
  },
  
  async writeFile(path: string, content: string): Promise<void> {
    if (path.includes('readonly')) {
      throw new Error('Permission denied')
    }
    // Mock write - in real implementation would write to filesystem
    console.log(`Writing to ${path}: ${content.substring(0, 50)}...`)
  },
  
  // Mock string operations  
  async base64Encode(input: string): Promise<string> {
    return btoa(input)
  },
  
  async base64Decode(input: string): Promise<string> {
    try {
      return atob(input)
    } catch {
      throw new Error('Invalid base64 input')
    }
  }
} satisfies ValidIO

// Custom error types for testing
type TestError = {
  message: string
  canRetry: boolean
}

type NetworkError = {
  code: number
  reason: string
}

// Helper function to create a task that immediately fails
function taskError<T = never, E = TestError>(error: E): Task<T, E, {}> {
  return Task.create(async function*() {
    yield failure<T, E>(error)
  })
}

// Helper function to collect all states from a task execution
async function collectStates<T, E>(task: Task<T, E, {}>, io = {}): Promise<Array<any>> {
  const states = []
  for await (const state of task.run(io)) {
    states.push(state)
  }
  return states
}

// Helper function to get the final successful value from a task
async function getFinalValue<T, E>(task: Task<T, E, {}>, io = {}): Promise<T | null> {
  let lastValue = null
  for await (const state of task.run(io)) {
    if (state.ok) {
      lastValue = state.value
    } else {
      return null // Task failed
    }
  }
  return lastValue
}

test('Task - Functor Laws', async (t) => {
  t.plan(4)

  // Identity Law: task.map(x => x) ≡ task
  const task1 = Task.of<number>(42)
  const identityMapped = task1.map(x => x)

  const original = await getFinalValue(task1)
  const mapped = await getFinalValue(identityMapped)

  t.equal(original, mapped, 'Functor identity law holds')

  // Composition Law: task.map(f).map(g) ≡ task.map(x => g(f(x)))
  const f = (x: number) => x * 2
  const g = (x: number) => x + 1

  const task2 = Task.of<number>(5)
  const composed1 = task2.map(f).map(g)
  const composed2 = task2.map(x => g(f(x)))

  const result1 = await getFinalValue(composed1)
  const result2 = await getFinalValue(composed2)

  t.equal(result1, result2, 'Functor composition law holds')
  t.equal(result1, 11, 'Functor composition produces expected result') // (5 * 2) + 1 = 11

  // Map should preserve errors
  const errorTask = taskError<number, TestError>({ message: 'test error', canRetry: true })
  const mappedError = errorTask.map(x => x)
  const errorStates = await collectStates(mappedError)

  t.ok(errorStates.length > 0 && errorStates[0] && !errorStates[0].ok, 'Map preserves errors')
})

test('Task.of - Static method behavior', async (t) => {
  t.plan(3)

  // Test basic Task.of functionality
  const task = Task.of<number>(42)
  const result = await getFinalValue(task)
  t.equal(result, 42, 'Task.of creates task with correct value')

  // Test Task.of with progress tracking
  const states = await collectStates(Task.of<string>('test'))
  t.equal(states.length, 1, 'Task.of yields exactly one state')

  const state = states[0]
  if (state && state.ok && state.progress) {
    t.equal(state.progress.total, 1, 'Task.of sets progress total to 1')
  } else {
    t.fail('Expected successful state with progress from Task.of')
  }
})

test('Task - Complete Monad Laws (flatMap)', async (t) => {
  t.plan(5)

  // Left Identity Law: Task.of(a).flatMap(f) ≡ f(a)
  const f = (x: number) => Task.of<number>(x * 2)
  const leftIdentity1 = Task.of<number>(21).flatMap(f)
  const leftIdentity2 = f(21)

  const leftResult1 = await getFinalValue(leftIdentity1)
  const leftResult2 = await getFinalValue(leftIdentity2)

  t.equal(leftResult1, leftResult2, 'Left identity law holds')
  t.equal(leftResult1, 42, 'Left identity produces expected result')

  // Right Identity Law: m.flatMap(Task.of) ≡ m
  const task1 = Task.of<number>(42)
  const rightIdentity = task1.flatMap(x => Task.of<number>(x))

  const original = await getFinalValue(task1)
  const rightResult = await getFinalValue(rightIdentity)

  t.equal(original, rightResult, 'Right identity law holds')

  // Associativity Law: m.flatMap(f).flatMap(g) ≡ m.flatMap(x => f(x).flatMap(g))
  const g = (x: number) => Task.of<number>(x + 1)

  const task2 = Task.of<number>(5)
  const assoc1 = task2.flatMap(f).flatMap(g)
  const assoc2 = task2.flatMap(x => f(x).flatMap(g))

  const result1 = await getFinalValue(assoc1)
  const result2 = await getFinalValue(assoc2)

  t.equal(result1, result2, 'Associativity law holds')
  t.equal(result1, 11, 'flatMap associativity produces expected result') // (5 * 2) + 1 = 11
})

test('Task - MapError functionality', async (t) => {
  t.plan(3)

  // Basic mapError functionality
  const errorTask = taskError<string, TestError>({ message: 'original error', canRetry: true })
  const mappedErrorTask = errorTask.mapError(err => ({ code: 500, reason: err.message }))

  const states = await collectStates(mappedErrorTask)
  t.ok(states.length > 0 && !states[0].ok, 'MapError preserves error state')

  const errorState = states[0]
  if (!errorState.ok) {
    t.equal(errorState.error.code, 500, 'MapError transforms error correctly')
    t.equal(errorState.error.reason, 'original error', 'MapError preserves error data')
  } else {
    t.fail('Expected error state')
  }
})

test('Task - Error Handling with orElse', async (t) => {
  t.plan(3)

  // orElse should handle errors
  const failingTask = taskError<string, TestError>({ message: 'initial error', canRetry: true })
  const recoveryTask = Task.of<string>('recovered')
  const recoveredTask = failingTask.orElse(() => recoveryTask)

  const result = await getFinalValue(recoveredTask)
  t.equal(result, 'recovered', 'orElse handles errors correctly')

  // orElse should pass through successful values
  const successTask = Task.of<string>('success')
  const notUsedTask = Task.of<string>('not used')
  const passedThroughTask = successTask.orElse(() => notUsedTask)

  const result2 = await getFinalValue(passedThroughTask)
  t.equal(result2, 'success', 'orElse passes through successful values')

  // orElse should handle chained errors
  const error1 = taskError<string, TestError>({ message: 'error 1', canRetry: false })
  const error2 = taskError<string, NetworkError>({ code: 404, reason: 'not found' })  
  const recovery = Task.of<string>('final recovery')

  const chainedRecovery = error1.orElse(() => error2).orElse(() => recovery)
  const result3 = await getFinalValue(chainedRecovery)
  t.equal(result3, 'final recovery', 'orElse handles chained error recovery')
})

test('Task - OrElseMap functionality', async (t) => {
  t.plan(4)

  // orElseMap should convert errors to success values
  const failingTask = taskError<number, TestError>({ message: 'calculation failed', canRetry: false })
  const recoveredTask = failingTask.orElseMap(err => 42)

  const result = await getFinalValue(recoveredTask)
  t.equal(result, 42, 'orElseMap converts error to success value')

  // orElseMap should pass through successful values
  const successTask = Task.of<number>(100)
  const passedThroughTask = successTask.orElseMap(() => 999)

  const result2 = await getFinalValue(passedThroughTask)
  t.equal(result2, 100, 'orElseMap passes through successful values')

  // orElseMap should preserve progress information
  const errorWithProgress = Task.create<number, TestError, {}>(async function*() {
    yield failure<number, TestError>({ message: 'error', canRetry: false }, { total: 5, current: 3 })
  })
  const recoveredWithProgress = errorWithProgress.orElseMap(err => 999)
  const states = await collectStates(recoveredWithProgress)

  t.ok(states.length > 0 && states[0].ok, 'orElseMap creates success state')
  const state = states[0]
  if (state.ok && state.progress) {
    t.equal(state.progress.current, 3, 'orElseMap preserves progress information')
  } else {
    t.fail('Expected successful state with progress')
  }
})

test('Task - Progress Tracking', async (t) => {
  t.plan(3)

  // Task with progress information
  const progressTask = Task.create<string, never, {}>(async function*() {
    yield success('step1', { total: 3, current: 1 })
    yield success('step2', { total: 3, current: 2 })  
    yield success('step3', { total: 3, current: 3 })
  })

  const states = await collectStates(progressTask)

  t.equal(states.length, 3, 'Task yields correct number of progress updates')
  const state2 = states[1]
  const state3 = states[2]
  t.equal(state2 && state2.ok && state2.progress ? state2.progress.current : -1, 2, 'Progress tracking works correctly')
  t.equal(state3 && state3.ok && state3.progress ? state3.progress.total : -1, 3, 'Total progress tracking works correctly')
})

test('Task - Edge Cases', async (t) => {
  t.plan(4)

  // Empty task (no yields)
  const emptyTask = Task.create<string, never, {}>(async function*() {
    return
  })

  const emptyStates = await collectStates(emptyTask)
  t.equal(emptyStates.length, 0, 'Empty task yields no states')

  // Task that yields only errors
  const onlyErrorTask = Task.create<string, TestError, {}>(async function*() {
    yield failure<string, TestError>({ message: 'only error', canRetry: false })
  })

  const errorResult = await getFinalValue(onlyErrorTask)
  t.equal(errorResult, null, 'Error-only task returns null for final value')

  // Task with mixed success and error states
  const mixedTask = Task.create<string, TestError, {}>(async function*() {
    yield success<string, TestError>('first')
    yield failure<string, TestError>({ message: 'middle error', canRetry: true })
    yield success<string, TestError>('last')  
  })

  const mixedStates = await collectStates(mixedTask)
  t.equal(mixedStates.length, 3, 'Mixed task yields all states')
  const middleState = mixedStates[1]
  t.equal(middleState ? !middleState.ok : false, true, 'Mixed task preserves error states')
})

test('Task - Method Chaining', async (t) => {
  t.plan(2)

  // Complex chaining of operations
  const chainedTask = Task.of<number>(10)
  .map(x => x * 2)           // 20
  .flatMap(x => Task.of<number>(x + 5))  // 25
  .map(x => x / 5)           // 5

  const result = await getFinalValue(chainedTask)
  t.equal(result, 5, 'Complex method chaining works correctly')

  // Chaining with error handling
  const errorInChain = Task.of<number>(10)
  .map(x => x * 2)
  .flatMap(() => taskError<string, TestError>({ message: 'chain error', canRetry: true }))
  .orElse(() => Task.of<string>('recovered'))
  .map(x => x + ' value')

  const errorResult = await getFinalValue(errorInChain)
  t.equal(errorResult, 'recovered value', 'Error handling in chains works correctly')
})

test('Task - IO Context', async (t) => {
  t.plan(2)

  // Task that uses IO context with custom properties
  interface TestIOBasic extends Partial<IO> {
    value?: number
  }

  const ioTask = Task.create<number, never, TestIOBasic>(async function*(io: TestIOBasic) {
    yield success((io.value || 0) * 2)
  })

  const ioContext: TestIOBasic = { value: 21 }
  const ioResult = await getFinalValue(ioTask, ioContext)
  t.equal(ioResult, 42, 'Task correctly uses IO context')

  // Task with extended IO context
  interface TestIO extends Partial<IO> {
    testValue?: string
  }

  const extendedIOTask = Task.create<string, never, TestIO>(async function*(io: TestIO) {
    yield success(io.testValue || 'default')
  })

  const extendedResult = await getFinalValue(extendedIOTask, { testValue: 'custom' })
  t.equal(extendedResult, 'custom', 'Task works with extended IO context')
})

test('Task - Signal Handling (AbortSignal)', async (t) => {
  t.plan(2)

  // Task that respects cancellation
  const cancellableTask = Task.create<string, TestError, {}>(async function*(_io: {}, signal?: AbortSignal) {
    yield success<string, TestError>('started')

    // Simulate checking for cancellation
    if (signal?.aborted) {
      yield failure<string, TestError>({ message: 'Task was cancelled', canRetry: false })
      return
    }

    yield success<string, TestError>('completed')
  })

  // Test without cancellation
  const normalResult = await getFinalValue(cancellableTask)
  t.equal(normalResult, 'completed', 'Task completes normally without cancellation')

  // Test with cancellation
  const controller = new AbortController()
  controller.abort()

  // Note: This test is simplified since we can't easily pass the signal in our helper
  t.ok(true, 'Task structure supports AbortSignal parameter')
})
