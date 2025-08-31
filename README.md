# Efficacy
Monadic Types for Async Operations with Typed IO Dependencies

## Core Concepts

### Task Type

The `Task<T, E, TaskIO>` type represents an asynchronous computation that:
- Produces a value of type `T` on success
- Fails with an error of type `E`
- Requires IO operations defined in `TaskIO`
- Returns a single `Result<T, E>` when executed

```typescript
import { Task } from './src/task'
import { ok, fail } from './src/result'

// Simple task that always succeeds
const simpleTask: Task<string, never, {}> = Task.of('Hello World')

// Task with custom error type
type AppError = { message: string; code: number }

const riskyTask: Task<number, AppError, {}> = Task.create(async (io, signal) => {
  if (Math.random() > 0.5) {
    return ok(42)
  } else {
    return fail({ message: 'Random failure', code: 500 })
  }
})

// Execute task
const result = await riskyTask.run({})
if (result.ok) {
  console.log('Success:', result.value)
} else {
  console.log('Error:', result.error)
}
```

### Stream Type

The `Stream<T, E, TaskIO>` type represents an asynchronous operation that yields progress updates:
- Yields multiple `Progress<T, E>` values during execution
- Each progress update can be a success or failure
- Includes optional progress tracking with `{ current, total }` information

```typescript
import { Stream, ok, fail } from './src/stream'

const progressStream: Stream<string, never, {}> = Stream.create(async function*() {
  yield ok('step 1', { total: 3, current: 1 })
  yield ok('step 2', { total: 3, current: 2 })
  yield ok('step 3', { total: 3, current: 3 })
})

// Consume progress updates
for await (const progress of progressStream.run({})) {
  if (progress.ok) {
    console.log(`Success: ${progress.value}`, progress.progress)
  } else {
    console.log(`Error: ${progress.error}`)
  }
}
```

### Monadic Operations

Both Task and Stream support full monadic operations with proper error type composition:

```typescript
const pipeline = Task.of(10)
  .map(x => x * 2)                    // Task<number, never, {}>
  .flatMap(x => Task.of(x + 5))       // Task<number, never, {}>
  .orElseMap(err => 0)                // Task<number, never, {}>
  .mapError(err => 'String error')    // Transform error types

const streamPipeline = Stream.const(10)
  .map(x => x * 2)                    // Stream<number, never, {}>
  .flatMap(x => Stream.const(x + 5))  // Stream<number, never, {}>
  .orElse(err => Stream.const(0))     // Error recovery
```

### Converting Between Task and Stream

Tasks and Streams are interoperable:

```typescript
// Convert Task to Stream (single progress update)
const task = Task.of('hello')
const stream = task.toStream()

// Convert Stream to Task (takes final progress update)
const stream2 = Stream.const('world')
const task2 = stream2.toTask()
```

## IO Interface

The library uses a `defineIO` helper function to create fully type-safe IO operations. Each consumer defines their own isolated IO interface, avoiding global pollution and enabling perfect TypeScript inference.

### Defining IO Operations

Use the `defineIO` helper function to create your IO operations:

```typescript
// In your application code
import { defineIO } from './src/io'

// Define your IO operations - types are automatically preserved
export const myIO = defineIO({
  async http(uri: string, options?: RequestInit): Promise<Response> {
    return fetch(uri, options)
  },

  async queryDB<T>(query: string, params?: any[]): Promise<T[]> {
    // Your database implementation
    return db.query(query, params)
  },

  async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf8')
  },

  async writeFile(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, 'utf8')
  },

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // Your email implementation
    await emailService.send({ to, subject, body })
  }
})

// TypeScript automatically infers the exact type
type MyIO = typeof myIO
```

### Consumer Isolation

Each consumer can define their own IO operations without conflicts:

```typescript
// Consumer A
const serviceAIO = defineIO({
  async fetchUser(id: string): Promise<User> { /* ... */ },
  async shared(): Promise<number> { return 42 }
})

// Consumer B - completely isolated, even with same method name!
const serviceBIO = defineIO({
  async fetchProduct(id: string): Promise<Product> { /* ... */ },
  async shared(): Promise<string> { return 'different!' }
})
```

### Using IO in Tasks

Tasks specify exactly which IO operations they need using `Pick`:

```typescript
import { Task } from './src/task'
import { ok, fail } from './src/result'

type UserData = { id: string; name: string; email: string }
type AppError = { message: string; code: number }

// Task specifies exactly which operations it needs
const processUser = (userId: string): Task<UserData, AppError, Pick<typeof myIO, 'queryDB' | 'sendEmail'>> => {
  return Task.create(async (io, signal) => {
    try {
      // TypeScript knows io has queryDB and sendEmail methods
      const users = await io.queryDB<UserData>('SELECT * FROM users WHERE id = ?', [userId])
      if (users.length === 0) {
        return fail({ message: 'User not found', code: 404 })
      }

      const user = users[0]
      await io.sendEmail(user.email, 'Welcome!', 'Thanks for joining!')

      return ok(user)
    } catch (error) {
      return fail({ message: error.message, code: 500 })
    }
  })
}

// Run the task - myIO contains all required operations
const result = await processUser('123').run(myIO)
```

### Using IO in Streams

Streams work the same way for progress-reporting operations:

```typescript
import { Stream, ok, fail } from './src/stream'

const processUserWithProgress = (userId: string): Stream<UserData, AppError, Pick<typeof myIO, 'queryDB' | 'sendEmail'>> => {
  return Stream.create(async function*(io, signal) {
    try {
      yield ok('Starting...', { total: 3, current: 1 })

      const users = await io.queryDB<UserData>('SELECT * FROM users WHERE id = ?', [userId])
      if (users.length === 0) {
        yield fail({ message: 'User not found', code: 404 })
        return
      }

      const user = users[0]
      yield ok(user, { total: 3, current: 2 })

      await io.sendEmail(user.email, 'Welcome!', 'Thanks for joining!')
      yield ok(user, { total: 3, current: 3 })

    } catch (error) {
      yield fail({ message: error.message, code: 500 })
    }
  })
}

// Consume with progress
for await (const progress of processUserWithProgress('123').run(myIO)) {
  console.log(progress)
}
```

## Error Handling

Both Task and Stream provide multiple strategies for error handling:

### `orElse` - Error Recovery with Tasks/Streams
```typescript
const withFallback = riskyTask.orElse(error => 
  Task.of(`Fallback value: ${error.message}`)
)
// Type: Task<string, never, {}>

const streamWithFallback = riskyStream.orElse(error =>
  Stream.const(`Recovered from: ${error.message}`)
)
```

### `orElseMap` - Direct Error-to-Value Conversion
```typescript
const withDefault = riskyTask.orElseMap(error => -1)
// Type: Task<number, never, {}> - never fails!

const streamWithDefault = riskyStream.orElseMap(error => -1)
// Type: Stream<number, never, {}> - never fails!
```

### `mapError` - Error Type Transformation
```typescript
type StringError = string

const stringErrors = riskyTask.mapError(err => 
  `${err.code}: ${err.message}`
)
// Type: Task<number, StringError, {}>
```

## Progress Tracking with Streams

Streams are designed for operations that need to report progress:

```typescript
import { Stream, ok, fail } from './src/stream'

const longRunningOperation = Stream.create(async function*() {
  const total = 100

  for (let i = 1; i <= total; i++) {
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 10))

    if (i === 50 && Math.random() > 0.8) {
      // Occasional failure
      yield fail('Midway error occurred', { total, current: i })
      return
    }

    yield ok(`Completed step ${i}`, { total, current: i })
  }
})

// Consume with progress updates
for await (const progress of longRunningOperation.run({})) {
  if (progress.ok) {
    const pct = progress.progress ? 
      Math.round((progress.progress.current / progress.progress.total) * 100) : 0
    console.log(`${pct}%: ${progress.value}`)
  } else {
    console.error('Failed:', progress.error)
  }
}
```

## Static Constructors

### Task Static Methods
- `Task.of(value)` - Create a task that immediately succeeds
- `Task.reject(error)` - Create a task that immediately fails
- `Task.create(init)` - Create a custom task with an initialization function

### Stream Static Methods
- `Stream.const(value)` - Create a stream that yields one success value
- `Stream.never(error)` - Create a stream that yields one failure
- `Stream.create(init)` - Create a custom stream with a generator function

## Cancellation Support

Both Task and Stream support cancellation via AbortSignal:

```typescript
const controller = new AbortController()

const cancellableTask = Task.create(async (io, signal) => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(ok('completed')), 5000)

    signal?.addEventListener('abort', () => {
      clearTimeout(timeout)
      resolve(fail('cancelled'))
    })
  })
})

// Cancel after 1 second
setTimeout(() => controller.abort(), 1000)

const result = await cancellableTask.run({}, controller.signal)
```

## Development

This project uses [Bun](https://bun.sh)

```bash
bun install     # Install dependencies
bun test        # Run test suite
```

## API Reference

### Core Types

- **`Result<T, E>`** - A discriminated union representing either success with a value of type `T`, or failure with an error of type `E`. This is the fundamental return type that eliminates null/undefined ambiguity.

- **`Task<T, E, TaskIO>`** - Represents a single asynchronous operation that will eventually complete with either success or failure. Tasks are lazy (don't execute until `.run()` is called) and composable through monadic operations.

- **`Stream<T, E, TaskIO>`** - Represents a long-running asynchronous operation that can emit multiple progress updates before completing. Each update can be either a success or failure state, making it ideal for operations like file uploads, data processing, or multi-step workflows.

- **`Progress<T, E>`** - A progress update emitted by streams, containing the same success/failure information as `Result` but with additional optional progress metadata (`current` and `total` counts).

- **`IO`** - A type-safe interface specification for external dependencies (file system, database, HTTP, etc.). This enables dependency injection and makes your code testable by allowing mock implementations.

### Task Static Constructors

- **`Task.create(init)`** - Creates a custom task from an async function. Use this when you need to perform complex async operations or integrate with existing Promise-based APIs.

- **`Task.of(value)`** - Creates a task that immediately succeeds with the given value. Useful for starting task chains or converting synchronous values into the task context.

- **`Task.reject(error)`** - Creates a task that immediately fails with the given error. Useful for error conditions or testing failure scenarios.

### Task Instance Methods

- **`.map<U>(fn: (value: T) => U)`** - Transforms the success value using a synchronous function, leaving errors unchanged. This is your primary tool for data transformation in successful cases. The error type remains the same, making this operation safe and predictable.

- **`.flatMap<U, F, NextIO>(fn: (value: T) => Task<U, F, NextIO>)`** - Chains tasks together sequentially. The function receives the success value and returns a new task. If either task fails, the entire chain fails. The error types are combined (E | F), and IO requirements can change between tasks.

- **`.mapError<F>(fn: (error: E) => F)`** - Transforms error values while leaving successful values unchanged. Use this to convert between different error types, add context to errors, or normalize error formats across your application.

- **`.orElse<F, NextIO>(fn: (error: E) => Task<T, F, NextIO>)`** - Provides error recovery by running an alternative task when the original fails. The recovery function receives the error and returns a new task. Success values pass through unchanged.

- **`.orElseMap(fn: (error: E) => T)`** - Directly converts errors to success values using a synchronous function. This eliminates the possibility of failure entirely, returning a `Task<T, never, TaskIO>` that cannot fail.

- **`.toStream()`** - Converts the task into a stream that emits one progress update with the task's result. Useful when you need to integrate a simple task into a progress-reporting workflow.

- **`.run(io, signal?)`** - Executes the task with the provided IO dependencies. Returns a Promise that resolves to a Result. The optional AbortSignal allows cancellation of long-running operations.

### Stream Static Constructors

- **`Stream.create(init)`** - Creates a custom stream from an async generator function. Use this for complex streaming operations that need to emit multiple progress updates.

- **`Stream.const(value)`** - Creates a stream that emits one successful progress update and completes. Useful for converting single values into the streaming context.

- **`Stream.never(error)`** - Creates a stream that emits one failure update and completes. Useful for error conditions in streaming workflows.

### Stream Instance Methods

- **`.map<U>(fn: (value: T) => U)`** - Transforms successful progress values using a synchronous function, leaving errors and progress metadata unchanged. Each successful update in the stream is transformed individually.

- **`.flatMap<U, F, NextIO>(fn: (value: T) => Stream<U, F, NextIO>)`** - Chains streams together. For each successful value, the function returns a new stream whose updates are flattened into the result stream. Error values pass through unchanged.

- **`.mapError<F>(fn: (error: E) => F)`** - Transforms error values in progress updates while leaving successful values and progress metadata unchanged. Useful for error normalization in streaming workflows.

- **`.orElse<F, NextIO>(fn: (error: E) => Stream<T, F, NextIO>)`** - Provides error recovery at the stream level. When an error update occurs, the recovery function returns a replacement stream whose updates continue the original stream.

- **`.orElseMap(fn: (error: E) => T)`** - Converts error updates directly to success updates using a synchronous function. This creates an infallible stream (`Stream<T, never, TaskIO>`) that cannot emit errors.

- **`.toTask()`** - Converts the stream to a task by collecting all progress updates and returning the final result. Useful when you only care about the end result of a streaming operation.

- **`.run(io, signal?)`** - Executes the stream with the provided IO dependencies. Returns an AsyncGenerator that yields progress updates. Use `for await...of` to consume the updates.
