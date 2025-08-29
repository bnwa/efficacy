# Task: Monadic Task Type with Typed IO Dependencies

A TypeScript library providing a well-typed, monadic `Task` type that features:
- **Generic error types** (`Task<T, E, TaskIO>`) instead of hardcoded error structures
- **Extensible IO interface** via TypeScript module declaration merging
- **Separated progress tracking** from core result semantics
- **Full monadic operations**: `map`, `flatMap`, `orElse`, `orElseMap`, `mapError`

## Quick Start

```bash
bun install
bun test  # Run tests
```

## Core Concepts

### Task Type

The `Task<T, E, TaskIO>` type represents an asynchronous computation that:
- Produces a value of type `T` on success
- Fails with an error of type `E`  
- Requires IO operations defined in `TaskIO`
- Optionally reports progress during execution

```typescript
import { Task, success, failure } from './task/core'

// Simple task that always succeeds
const simpleTask: Task<string, never, {}> = Task.of('Hello World')

// Task with custom error type
type AppError = { message: string; code: number }

const riskyTask: Task<number, AppError, {}> = Task.create(async function*() {
  if (Math.random() > 0.5) {
    yield success(42, { total: 1, current: 1 })
  } else {
    yield failure({ message: 'Random failure', code: 500 })
  }
})
```

### Monadic Operations

Tasks support full monadic operations with proper error type composition:

```typescript
const pipeline = Task.of(10)
  .map(x => x * 2)                    // Task<number, never, {}>
  .flatMap(x => Task.of(x + 5))       // Task<number, never, {}>  
  .orElseMap(err => 0)                // Task<number, never, {}>
  .mapError(err => 'String error')    // Transform error types
```

## IO Interface

The `IO` interface is designed to be extended by consumers via TypeScript module declaration merging. This allows the Task library to remain agnostic about specific IO implementations while providing strong typing.

### Extending IO

To add your own IO operations, use TypeScript's module declaration syntax:

```typescript
// In your application code
import type { IO, IOOperation } from './io'

declare module './io' {
  interface IO {
    // HTTP operations
    http(uri: string, options?: RequestInit): Promise<Response>
    
    // Database operations  
    queryDB<T>(query: string, params?: any[]): Promise<T[]>
    
    // File system operations
    readFile(path: string): Promise<string>
    writeFile(path: string, content: string): Promise<void>
    
    // Any other async operations your app needs
    sendEmail(to: string, subject: string, body: string): Promise<void>
  }
}

// Then provide your implementation
export const myIO: IO = {
  async http(uri, options) {
    return fetch(uri, options)
  },
  
  async queryDB(query, params) {
    // Your database implementation
    return db.query(query, params)
  },
  
  async readFile(path) {
    return fs.readFile(path, 'utf8')
  },
  
  async writeFile(path, content) {
    await fs.writeFile(path, content, 'utf8')
  },
  
  async sendEmail(to, subject, body) {
    // Your email implementation
    await emailService.send({ to, subject, body })
  }
}
```

### Usage in Tasks

Once you've extended the IO interface, you can use those operations in your Tasks:

```typescript
import { Task, success, failure } from './task/core'
import type { IO } from './io'

type UserData = { id: string; email: string; name: string }
type AppError = { message: string; code: number }

// Task that uses multiple IO operations
const processUserData = (userId: string): Task<UserData, AppError, Pick<IO, 'queryDB' | 'sendEmail'>> => {
  return Task.create(async function*(io) {
    // Query user from database
    const users = await io.queryDB('SELECT * FROM users WHERE id = ?', [userId])
    if (users.length === 0) {
      yield failure({ message: 'User not found', code: 404 })
      return
    }
    
    const user = users[0] as UserData
    yield success(user, { total: 2, current: 1 })
    
    // Send welcome email
    await io.sendEmail(user.email, 'Welcome!', 'Thanks for joining!')
    yield success(user, { total: 2, current: 2 })
  })
}
```

## Error Handling

The library provides multiple strategies for error handling:

### `orElse` - Error Recovery with Tasks
```typescript
const withFallback = riskyTask.orElse(error => 
  Task.of(`Fallback value: ${error.message}`)
)
// Type: Task<string, never, {}>
```

### `orElseMap` - Direct Error-to-Value Conversion
```typescript
const withDefault = riskyTask.orElseMap(error => -1)
// Type: Task<number, never, {}> - never fails!
```

### `mapError` - Error Type Transformation  
```typescript
type StringError = string

const stringErrors = riskyTask.mapError(err => 
  `${err.code}: ${err.message}`
)
// Type: Task<number, StringError, {}>
```

## Progress Tracking

Progress information is optional and separate from core result semantics:

```typescript
const progressTask = Task.create(async function*() {
  yield success('step 1', { total: 3, current: 1 })
  yield success('step 2', { total: 3, current: 2 })
  yield success('step 3', { total: 3, current: 3 })
})

// Consume progress
for await (const state of progressTask.run({})) {
  if (state.ok && state.progress) {
    console.log(`Progress: ${state.progress.current}/${state.progress.total}`)
  }
}
```

## Design Benefits

1. **Separation of Concerns**: IO operations are defined by the consumer, not the library
2. **Testability**: Easy to mock IO operations for testing  
3. **Type Safety**: Full TypeScript support with proper inference
4. **Flexibility**: Support any async operation your application needs
5. **Composability**: Tasks can require specific IO operations via `Pick<IO, 'operation1' | 'operation2'>`
6. **Generic Error Types**: No hardcoded error structures - use your own error types
7. **Progress Tracking**: Optional, separate from core result semantics

## Development

This project uses [Bun](https://bun.sh) for fast JavaScript runtime and package management.

```bash
bun install     # Install dependencies
bun test        # Run test suite
```
