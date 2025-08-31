/**
 * Efficacy - Functional types for validation and async operations with typed IO dependencies
 * 
 * This module provides a comprehensive set of functional programming utilities for:
 * - Validation and assertion with detailed error reporting
 * - Result types for error handling without exceptions  
 * - Task types for async operations with dependency injection
 * - Stream types for progress-aware async operations
 * - IO operation definitions with type safety
 */

// Assert module - validation and assertion utilities
export {
  type ValidationError,
  type Valid,
  type Invalid, 
  type Assert,
  valid,
  invalid,
  isValid,
  map,
  fold,
  apply,
  sequence,
  traverse,
  lift,
  withPath,
  withCode,
  withContext,
  assert,
  errGet,
  errAppend,
  errJoin
} from './src/assert.ts'

// Result module - success/failure result types
export {
  type Success,
  type Failure,
  type Result,
  ok,
  fail,
  isFailure
} from './src/result.ts'

// IO module - typed IO operation definitions
export {
  type IOOperation,
  type ValidIO,
  type IO,
  defineIO
} from './src/io.ts'

// Task module - async operations with dependency injection
export {
  Task
} from './src/task.ts'

// Stream module - progress-aware async operations
export {
  type ProgressState,
  type ProgressOk,
  type ProgressFail,
  type Progress,
  type StreamExec,
  type StreamInit,
  Stream,
  ok as progressOk,
  fail as progressFail,
  isFailure as isProgressFailure
} from './src/stream.ts'

// Re-export commonly used type combinations for convenience
export type {
  Progress as ProgressResult
} from './src/stream.ts'

export type {
  IOOperation as AsyncOperation
} from './src/io.ts'
