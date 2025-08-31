# Efficacy
Types for validation and async operations with typed IO dependencies

## Core Concepts

### Task Type

The `Task<T, E, TaskIO>` type represents an asynchronous computation that:
- Produces a value of type `T` on success
- Fails with an error of type `E`
- Requires IO operations defined in `TaskIO`
- Returns a single `Result<T, E>` when executed

```typescript
import { Task, ok, fail } from 'efficacy'
// or import from individual modules
// import { Task } from 'efficacy/task'
// import { ok, fail } from 'efficacy/result'

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
import { Stream, progressOk, progressFail } from 'efficacy'
// or import from individual modules
// import { Stream, ok as progressOk, fail as progressFail } from 'efficacy/stream'

const progressStream: Stream<string, never, {}> = Stream.create(async function*() {
  yield progressOk('step 1', { total: 3, current: 1 })
  yield progressOk('step 2', { total: 3, current: 2 })
  yield progressOk('step 3', { total: 3, current: 3 })
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

## Assert Type - Functional Validation

The `Assert<T>` type represents a validation result that can either contain a valid value or validation errors. It provides a functional approach to data validation with composable error handling.

### Basic Usage

```typescript
import { valid, invalid, isValid, assert } from 'efficacy'
// or import from individual modules
// import { valid, invalid, isValid, assert } from 'efficacy/assert'

// Create valid and invalid results
const validAge = valid(25)
const invalidEmail = invalid("Invalid email format")

// Type-safe checking
if (isValid(validAge)) {
  console.log(validAge.value) // 25
}

// Extract values or throw errors
try {
  const age = assert(validAge) // 25
  const email = assert(invalidEmail) // throws Error
} catch (error) {
  console.log(error.message) // "Invalid email format"
}
```

### Validation with Context

Build rich validation errors with path, code, and context information:

```typescript
import { withPath, withCode, withContext, invalid } from 'efficacy'

const validationError = withPath(['user', 'profile', 'email'],
  withCode('INVALID_EMAIL',
    withContext(
      { received: 'not-an-email', expected: 'email format' },
      invalid("Invalid email address")
    )
  )
)

// Error contains: path, code, context, and message
if (!isValid(validationError)) {
  const error = validationError.error[0]
  console.log(error?.path)     // ['user', 'profile', 'email']
  console.log(error?.code)     // 'INVALID_EMAIL'
  console.log(error?.context)  // { received: 'not-an-email', expected: 'email format' }
  console.log(error?.message)  // 'Invalid email address'
}
```

### Monadic Operations

Transform and compose validations using monadic operations:

```typescript
import { map, apply, lift, sequence, traverse } from 'efficacy'

// Transform valid values
const doubled = map(valid(21), x => x * 2)
console.log(assert(doubled)) // 42

// Apply functions to validated arguments
const add = (a: number, b: number) => a + b
const result = lift(add, valid(5), valid(3))
console.log(assert(result)) // 8

// Sequence multiple validations
const numbers = [valid(1), valid(2), valid(3)]
const allNumbers = sequence(numbers)
console.log(assert(allNumbers)) // [1, 2, 3]

// Transform and validate arrays
const parseNumber = (x: string) => {
  const parsed = parseInt(x, 10)
  return isNaN(parsed) ? invalid("Not a number") : valid(parsed)
}

const strings = ['1', '2', '3']
const parsed = traverse(strings, parseNumber)
console.log(assert(parsed)) // [1, 2, 3]
```

### Validation Error Accumulation

The library accumulates validation errors rather than failing on the first error:

```typescript
import { fold } from 'efficacy'

// Fold over validated results
const sum = (a: number, b: number) => a + b
const results = [valid(1), invalid("Error 1"), valid(3), invalid("Error 2")]

try {
  assert(fold(results, valid(0), sum))
} catch (error) {
  console.log(error.message) // Contains all accumulated errors
}
```

### Applicative Laws

The Assert type follows applicative functor laws, making it mathematically sound for composition:

```typescript
import { apply } from 'efficacy'

// Identity law: apply(valid(identity), v) === v
const identity = <T>(x: T): T => x
const value = valid(42)
const applied = apply(valid(identity), value)
console.log(assert(applied) === assert(value)) // true

// Homomorphism law: apply(valid(f), valid(x)) === valid(f(x))
const double = (x: number) => x * 2
const left = apply(valid(double), valid(5))
const right = valid(double(5))
console.log(assert(left) === assert(right)) // true
```

## IO Interface

The library uses a `defineIO` helper function to create fully type-safe IO operations. Each consumer defines their own isolated IO interface, avoiding global pollution and enabling perfect TypeScript inference.

### Defining IO Operations

Use the `defineIO` helper function to create your IO operations:

```typescript
// In your application code
import { defineIO } from 'efficacy'
// or import from individual module
// import { defineIO } from 'efficacy/io'

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
import { Task, ok, fail } from 'efficacy'

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
import { Stream, progressOk, progressFail } from 'efficacy'

const processUserWithProgress = (userId: string): Stream<UserData, AppError, Pick<typeof myIO, 'queryDB' | 'sendEmail'>> => {
  return Stream.create(async function*(io, signal) {
    try {
      yield progressOk('Starting...', { total: 3, current: 1 })

      const users = await io.queryDB<UserData>('SELECT * FROM users WHERE id = ?', [userId])
      if (users.length === 0) {
        yield progressFail({ message: 'User not found', code: 404 })
        return
      }

      const user = users[0]
      yield progressOk(user, { total: 3, current: 2 })

      await io.sendEmail(user.email, 'Welcome!', 'Thanks for joining!')
      yield progressOk(user, { total: 3, current: 3 })

    } catch (error) {
      yield progressFail({ message: error.message, code: 500 })
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
import { Stream, progressOk, progressFail } from 'efficacy'

const longRunningOperation = Stream.create(async function*() {
  const total = 100

  for (let i = 1; i <= total; i++) {
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 10))

    if (i === 50 && Math.random() > 0.8) {
      // Occasional failure
      yield progressFail('Midway error occurred', { total, current: i })
      return
    }

    yield progressOk(`Completed step ${i}`, { total, current: i })
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

### Assert Static Functions
- `valid(value)` - Create a valid assertion result containing the given value
- `invalid(message)` - Create an invalid assertion result with a validation error

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

## Installation

### Using JSR (Recommended)

````bash
# Install via JSR CLI
npx jsr add @your-username/efficacy

# Or using JSR with npm
npm install @jsr/your-username__efficacy

# Or using JSR with yarn
yarn add @jsr/your-username__efficacy

# Or using JSR with pnpm
pnpm add @jsr/your-username__efficacy

# Or using JSR with bun
bunx jsr add @your-username/efficacy
````

### Import Usage

````typescript
// Main entry point - all exports
import { Task, Stream, valid, invalid, ok, fail, defineIO } from '@your-username/efficacy'

// Individual modules
import { Task } from '@your-username/efficacy/task'
import { Stream } from '@your-username/efficacy/stream'
import { valid, invalid } from '@your-username/efficacy/assert'
import { ok, fail } from '@your-username/efficacy/result'
import { defineIO } from '@your-username/efficacy/io'
````

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

- **`Assert<T>`** - A discriminated union representing either a valid value of type `T` or validation errors. Provides functional composition for validation logic with rich error information including path, code, and context.

- **`ValidationError`** - A structured error type containing message, optional path array, error code, and context information. Enables precise error reporting and debugging in validation pipelines.

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

### Assert Functions

- **`valid<T>(value: T)`** - Creates a valid assertion result containing the given value. This represents successful validation and allows the value to flow through validation pipelines.

- **`invalid(message: string)`** - Creates an invalid assertion result with a validation error message. This represents validation failure and stops the validation pipeline with error information.

- **`isValid<T>(assert: Assert<T>)`** - Type guard function that checks if an assertion result is valid. Returns true for valid results and narrows the TypeScript type to provide safe access to the value.

- **`assert<T>(assert: Assert<T>, formatter?)`** - Extracts the value from a valid assertion or throws an error for invalid ones. Optional formatter function allows custom error message formatting.

- **`map<A, B>(assert: Assert<A>, fn: (value: A) => B)`** - Transforms valid values using a function, leaving invalid results unchanged. This is the fundamental building block for validation pipelines.

- **`apply<A, B>(fn: Assert<(a: A) => B>, arg: Assert<A>)`** - Applies a validated function to a validated argument. Both must be valid for the operation to succeed, making this useful for multi-argument validation.

- **`lift<T[], R>(fn: (...args: T) => R, ...assertions: Assert<T>[])`** - Lifts a pure function to work with multiple validated arguments. All arguments must be valid for the function to execute.

- **`sequence<T>(assertions: Assert<T>[])`** - Converts an array of assertions into an assertion of an array. All individual assertions must be valid for the sequence to succeed.

- **`traverse<A, B>(items: A[], fn: (item: A) => Assert<B>)`** - Maps each item through a validation function, then sequences the results. Combines mapping and sequencing in one operation.

- **`fold<A, B>(assertions: Assert<A>[], initial: Assert<B>, fn: (acc: B, value: A) => B)`** - Reduces an array of assertions using an accumulator function. Stops on the first invalid assertion and returns its error.

- **`withPath<T>(path: string[], assert: Assert<T>)`** - Adds path information to validation errors, useful for tracking which field or property failed validation in complex data structures.

- **`withCode<T>(code: string, assert: Assert<T>)`** - Adds an error code to validation errors, enabling programmatic error handling and internationalization of error messages.

- **`withContext<T>(context: object, assert: Assert<T>)`** - Adds contextual information to validation errors, such as expected vs received values or validation constraints that were violated.
