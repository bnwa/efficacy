/**
 * @module
 *
 * Fundamental result types for error handling without exceptions.
 *
 * The `Result<T, E>` type is a discriminated union representing either success with a value
 * of type `T`, or failure with an error of type `E`. This eliminates null/undefined ambiguity
 * and provides a functional approach to error handling.
 *
 * ```typescript
 * import { ok, fail, isFailure } from 'efficacy/result'
 *
 * const success = ok(42)           // { ok: true, value: 42 }
 * const failure = fail("error")    // { ok: false, error: "error" }
 *
 * if (isFailure(result)) {
 *   console.log('Error:', result.error)
 * } else {
 *   console.log('Success:', result.value)
 * }
 * ```
 */

/**
 * Represents a successful result containing a value of type `T`.
 *
 * This type is part of the discriminated union `Result<T, E>` and provides
 * type-safe access to successful operation results without null/undefined ambiguity.
 *
 * @template T The type of the success value
 */
export type Success<T> = { ok: true,   value: T }

/**
 * Represents a failed result containing an error of type `E`.
 *
 * This type is part of the discriminated union `Result<T, E>` and provides
 * type-safe access to error information without throwing exceptions.
 *
 * @template E The type of the error value
 */
export type Failure<E> = { ok: false,  error: E }

/**
 * A discriminated union representing either success with a value of type `T`,
 * or failure with an error of type `E`.
 *
 * This is the fundamental return type that eliminates null/undefined ambiguity
 * and provides a functional approach to error handling. The `ok` property
 * acts as a type discriminator for safe pattern matching.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 *
 * @example
 * ```typescript
 * const success: Result<number, string> = ok(42)
 * const failure: Result<number, string> = fail("error")
 *
 * if (success.ok) {
 *   console.log(success.value) // 42 - TypeScript knows this is number
 * } else {
 *   console.log(success.error) // TypeScript knows this is string
 * }
 * ```
 */
export type Result<T, E> =
  | Success<T>
  | Failure<E>


/**
 * Creates a successful result containing the given value.
 *
 * This is the primary constructor for successful operations in the Result type system.
 * Use this when an operation completes successfully and you want to wrap the value
 * in a type-safe Result container.
 *
 * @template T The type of the success value
 * @template E The type of potential errors (defaults to never since this creates success)
 * @param value The successful value to wrap
 * @returns A successful Result containing the provided value
 *
 * @example
 * ```typescript
 * const result = ok(42)
 * console.log(result) // { ok: true, value: 42 }
 *
 * // With explicit error type
 * const typedResult: Result<number, string> = ok(100)
 * ```
 */
export function ok<T, E = never>(value: T) : Result<T, E> {
  return { ok: true, value }
}

/**
 * Creates a failed result containing the given error.
 *
 * This is the primary constructor for failed operations in the Result type system.
 * Use this when an operation fails and you want to wrap the error information
 * in a type-safe Result container instead of throwing exceptions.
 *
 * @template T The type of potential success values
 * @template E The type of the error value
 * @param error The error information to wrap
 * @returns A failed Result containing the provided error
 *
 * @example
 * ```typescript
 * const result = fail({ message: "Not found", code: 404 })
 * console.log(result) // { ok: false, error: { message: "Not found", code: 404 } }
 *
 * // Simple string error
 * const simpleError: Result<number, string> = fail("Something went wrong")
 * ```
 */
export function fail<T, E>(error: E) : Result<T, E> {
  return { ok: false, error }
}

/**
 * Type guard to check if a result represents a failure.
 *
 * This function provides type-safe checking for Result values, narrowing the TypeScript
 * type to Failure<E> when the check passes. This enables safe access to the error
 * property without additional type assertions.
 *
 * @template T The type of potential success values
 * @template E The type of the error value
 * @param result The Result value to check
 * @returns True if the result is a failure, false if it's a success
 *
 * @example
 * ```typescript
 * const result = fail("network error")
 * if (isFailure(result)) {
 *   console.log(result.error) // "network error" - TypeScript knows this is string
 *   // result.value would be a TypeScript error here
 * } else {
 *   console.log(result.value) // TypeScript knows this is the success type
 * }
 * ```
 */
export function isFailure<T, E>(result: Result<T, E>) : result is Failure<E> {
  return !result.ok
}
