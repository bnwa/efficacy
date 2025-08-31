/**
 * @module
 *
 * Functional validation with composable error handling.
 *
 * The `Assert<T>` type represents a validation result that can either contain a valid value
 * or validation errors. It provides a functional approach to data validation with composable
 * error handling, rich error information, and applicative functor laws for sound composition.
 *
 * ```typescript
 * import { valid, invalid, isValid, assert, lift } from 'efficacy/assert'
 *
 * // Basic validation
 * const validAge = valid(25)
 * const invalidEmail = invalid("Invalid email format")
 *
 * if (isValid(validAge)) {
 *   console.log(validAge.value) // 25
 * }
 *
 * // Compose validations
 * const add = (a: number, b: number) => a + b
 * const result = lift(add, valid(5), valid(3))
 * console.log(assert(result)) // 8
 *
 * // Rich error context
 * const richError = withPath(['user', 'email'],
 *   withCode('INVALID_EMAIL', invalid("Invalid format")))
 * ```
 */

/**
 * A structured error type containing message, optional path array, error code,
 * and context information.
 *
 * Enables precise error reporting and debugging in validation pipelines by providing
 * rich contextual information about what went wrong and where.
 *
 * @example
 * ```typescript
 * const error: ValidationError = {
 *   message: "Invalid email format",
 *   path: ['user', 'profile', 'email'],
 *   code: 'INVALID_EMAIL',
 *   context: {
 *     received: 'not-an-email',
 *     expected: 'email format',
 *     constraints: { pattern: /^[^@]+@[^@]+\.[^@]+$/ }
 *   }
 * }
 * ```
 */
export type ValidationError = {
  /** The human-readable error message */
  message: string
  /** Optional path array indicating where in a nested structure the error occurred */
  path?: readonly string[]
  /** Optional error code for programmatic error handling */
  code?: string
  /** Optional context information providing additional details about the validation failure */
  context?: Readonly<{
    /** The actual value that was received */
    received?: string
    /** The expected value or format */
    expected?: string
    /** Additional constraints or validation rules that were violated */
    constraints?: Record<string, unknown>
  }>
}

/**
 * Represents a successful validation result containing a value of type `T`.
 *
 * This type is part of the discriminated union `Assert<T>` and provides
 * type-safe access to validated values in validation pipelines.
 *
 * @template T The type of the validated value
 */
export type Valid<T> = Readonly<{ valid: true, value: T }>

/**
 * Represents a failed validation result containing validation errors.
 *
 * This type is part of the discriminated union `Assert<T>` and contains
 * an array of ValidationError objects providing detailed failure information.
 */
export type Invalid = Readonly<{ valid: false, error: readonly ValidationError[] }>

/**
 * A discriminated union representing either a valid value of type `T`
 * or validation errors.
 *
 * Provides functional composition for validation logic with rich error information.
 * The `valid` property acts as a type discriminator for safe pattern matching,
 * and follows applicative functor laws for mathematically sound composition.
 *
 * @template T The type of the value when validation succeeds
 *
 * @example
 * ```typescript
 * const validAge = valid(25)
 * const invalidEmail = invalid("Invalid email format")
 *
 * if (isValid(validAge)) {
 *   console.log(validAge.value) // 25 - TypeScript knows this is number
 * }
 *
 * // Compose validations
 * const add = (a: number, b: number) => a + b
 * const result = lift(add, valid(5), valid(3))
 * console.log(assert(result)) // 8
 * ```
 */
export type Assert<T> = Valid<T> | Invalid

/**
 * Utility type for mapping an array of types to an array of their corresponding Assert types.
 *
 * Used internally for functions like `lift` that work with multiple validated arguments.
 *
 * @template T Tuple of types to be validated
 */
type Validate<T extends unknown[]> = {
  [K in keyof T]: Assert<T[K]>
}


const append = <T>(xs: T[], x: T): T[] => (xs.push(x), xs)


/**
 * Creates a valid assertion result containing the given value.
 *
 * This represents successful validation and allows the value to flow through
 * validation pipelines. Use this when input data passes all validation checks.
 *
 * @template T The type of the validated value
 * @param x The value that passed validation
 * @returns A Valid<T> assertion result containing the value
 *
 * @example
 * ```typescript
 * const result = valid(42)
 * console.log(result) // { valid: true, value: 42 }
 *
 * // Can be used in validation pipelines
 * const doubled = map(valid(21), x => x * 2)
 * console.log(assert(doubled)) // 42
 * ```
 */
export function valid<T>(x: T): Valid<T> {
  return { valid: true, value: x }
}

/**
 * Creates an invalid assertion result with a validation error message.
 *
 * This represents validation failure and stops the validation pipeline with error
 * information. The error can be enhanced with additional context using `withPath`,
 * `withCode`, or `withContext` functions.
 *
 * @param message The validation error message describing what went wrong
 * @returns An Invalid assertion result containing the error
 *
 * @example
 * ```typescript
 * const result = invalid("Required field missing")
 * console.log(result) // { valid: false, error: [{ message: "Required field missing" }] }
 *
 * // Enhanced with context
 * const richError = withPath(['user', 'email'],
 *   withCode('REQUIRED', invalid("Email is required")))
 * ```
 */
export function invalid(message: string): Invalid {
  return { valid: false, error: [{ message }] }
}

/**
 * Type guard to check if an assertion result is valid.
 *
 * This function provides type-safe checking for Assert values, narrowing the TypeScript
 * type to Valid<T> when the check passes. This enables safe access to the value
 * property without additional type assertions.
 *
 * @template T The type of the value when valid
 * @param x The Assert result to check
 * @returns True if the assertion is valid, false if it contains errors
 *
 * @example
 * ```typescript
 * const result = valid(42)
 * if (isValid(result)) {
 *   console.log(result.value) // 42 - TypeScript knows this is number
 *   // result.error would be a TypeScript error here
 * } else {
 *   console.log(result.error) // TypeScript knows this is ValidationError[]
 * }
 * ```
 */
export function isValid<T>(x: Assert<T>): x is Valid<T> {
  return x.valid
}

/**
 * Transforms valid values using a function, leaving invalid results unchanged.
 *
 * This is the fundamental building block for validation pipelines. It allows you to
 * transform successful validation results while preserving error information when
 * validation has already failed.
 *
 * @template A The input type of the valid value
 * @template B The output type after transformation
 * @param a The Assert result to transform
 * @param f The transformation function to apply to valid values
 * @returns A new Assert result with transformed value or original errors
 *
 * @example
 * ```typescript
 * const result = map(valid(5), x => x * 2)
 * console.log(result) // { valid: true, value: 10 }
 *
 * // Errors pass through unchanged
 * const error = map(invalid("bad input"), x => x * 2)
 * console.log(error) // { valid: false, error: [{ message: "bad input" }] }
 * ```
 */
export function map<A, B>(a: Assert<A>, f: (a: A) => B): Assert<B> {
  return isValid(a) ? valid(f(a.value)) : a
}

/**
 * Reduces an array of assertions, accumulating valid results or collecting errors.
 *
 * Processes assertions left-to-right, accumulating successful values with the provided
 * function. Stops on the first invalid assertion and returns its error, enabling
 * fail-fast behavior in validation chains.
 *
 * @template A The type of values in the input assertions
 * @template B The type of the accumulator value
 * @param xs Array of Assert results to reduce
 * @param acc Initial accumulator value (must be valid)
 * @param f Reduction function to combine accumulator with valid values
 * @returns The final accumulated result or the first encountered error
 *
 * @example
 * ```typescript
 * const numbers = [valid(1), valid(2), valid(3)]
 * const sum = fold(numbers, valid(0), (acc, x) => acc + x)
 * console.log(assert(sum)) // 6
 *
 * // Stops on first error
 * const mixed = [valid(1), invalid("error"), valid(3)]
 * const result = fold(mixed, valid(0), (acc, x) => acc + x)
 * // Returns the invalid result
 * ```
 */
export function fold<A, B>(
  xs: Assert<A>[],
  acc: Assert<B>,
  f: (acc: B, x: A) => B
): Assert<B> {
  const [head, ...rest] = xs
  return head
    ? isValid(acc)
      ? isValid(head)
        ? fold(rest, valid(f(acc.value, head.value)), f)
        : head
      : acc
    : acc
}

/**
 * Applies a validated function to a validated argument.
 *
 * This implements the applicative functor pattern, allowing you to apply multi-argument
 * functions to validated inputs. Both the function and argument must be valid for the
 * operation to succeed, making this useful for multi-argument validation.
 *
 * @template A The type of the function argument
 * @template B The type of the function return value
 * @param f An Assert result containing a function
 * @param a An Assert result containing the argument
 * @returns The result of applying the function to the argument, or accumulated errors
 *
 * @example
 * ```typescript
 * const fn = valid((x: number) => x * 2)
 * const arg = valid(5)
 * const result = apply(fn, arg) // { valid: true, value: 10 }
 *
 * // If either is invalid, returns the error
 * const invalidFn = invalid("bad function")
 * const result2 = apply(invalidFn, valid(5)) // Returns the function error
 * ```
 */
export function apply<A, B>(f: Assert<(a: A) => B>, a: Assert<A>): Assert<B> {
  return isValid(f) ? (isValid(a) ? valid(f.value(a.value)) : a) : f
}

/**
 * Converts an array of assertions into an assertion of an array.
 *
 * All individual assertions must be valid for the sequence to succeed. This is useful
 * for validating arrays of values where you need all elements to pass validation
 * before proceeding.
 *
 * @template T The type of values in the assertions
 * @param assertions Array of Assert results to sequence
 * @returns An Assert result containing an array of all values, or the first error encountered
 *
 * @example
 * ```typescript
 * const assertions = [valid(1), valid(2), valid(3)]
 * const result = sequence(assertions) // { valid: true, value: [1, 2, 3] }
 *
 * // If any fail, returns the first failure
 * const mixed = [valid(1), invalid("error"), valid(3)]
 * const result2 = sequence(mixed) // Returns the invalid assertion
 * ```
 */
export function sequence<T>(assertions: Assert<T>[]): Assert<T[]> {
  return fold(assertions, valid([] as T[]), (acc, x) => [...acc, x])
}

/**
 * Maps each element through a validation function, then sequences the results.
 *
 * Combines mapping and sequencing in one operation. Each item is transformed through
 * the validation function, and then all results are sequenced together. This is
 * useful for validating and transforming arrays of input data.
 *
 * @template A The type of input items
 * @template B The type of validated output items
 * @param items Array of items to validate and transform
 * @param f Validation function to apply to each item
 * @returns An Assert result containing an array of validated items, or the first validation error
 *
 * @example
 * ```typescript
 * const items = ['1', '2', '3']
 * const parseNumber = (x: string) => {
 *   const num = parseInt(x, 10)
 *   return isNaN(num) ? invalid("Not a number") : valid(num)
 * }
 * const result = traverse(items, parseNumber)
 * console.log(assert(result)) // [1, 2, 3]
 * ```
 */
export function traverse<A, B>(items: A[], f: (a: A) => Assert<B>): Assert<B[]> {
  return sequence(items.map(f))
}

/**
 * Lifts a pure function to work with validated arguments.
 *
 * Takes a regular function and allows it to work with multiple validated inputs.
 * All arguments must be valid for the function to execute. This follows the
 * applicative functor laws for mathematically sound composition.
 *
 * @template T Tuple of argument types
 * @template R The return type of the function
 * @param f The function to lift into the validation context
 * @param args Validated arguments to pass to the function
 * @returns The result of applying the function to all arguments, or accumulated errors
 *
 * @example
 * ```typescript
 * const add = (a: number, b: number) => a + b
 * const result = lift(add, valid(5), valid(3)) // { valid: true, value: 8 }
 *
 * // If any argument is invalid, returns the first error
 * const result2 = lift(add, valid(5), invalid("bad number"))
 * // Returns the invalid argument
 * ```
 */
export function lift<T extends unknown[], R>(
  f: (...xs: [...T]) => R,
  ...args: Validate<T>
): Assert<R> {
  const res = fold(args, valid([] as T[number][]), append)
  if (isValid(res)) return valid(f(...(res.value as T)))
  else return res
}

/**
 * Adds path information to validation errors.
 *
 * This function enriches validation errors with location information, making it easier
 * to track which field or property failed validation in complex nested data structures.
 * Valid assertions pass through unchanged.
 *
 * @template T The type of the value being validated
 * @param path Array of strings representing the path to the failing field
 * @param assertion The Assert result to enhance with path information
 * @returns The same assertion with path information added to any errors
 *
 * @example
 * ```typescript
 * const result = withPath(['user', 'profile', 'email'], invalid("Invalid email"))
 * console.log(result.error[0].path) // ['user', 'profile', 'email']
 *
 * // Can be chained with other context functions
 * const richError = withPath(['settings'],
 *   withCode('REQUIRED', invalid("Field is required")))
 * ```
 */
export function withPath<T>(path: readonly string[], assertion: Assert<T>): Assert<T> {
  if (isValid(assertion)) return assertion
  return { valid: false, error: assertion.error.map(err => ({ ...err, path })) }
}

/**
 * Adds an error code to validation errors.
 *
 * This function adds programmatic error codes to validation failures, enabling
 * structured error handling and internationalization of error messages.
 * Valid assertions pass through unchanged.
 *
 * @template T The type of the value being validated
 * @param code The error code to add to validation errors
 * @param assertion The Assert result to enhance with error code
 * @returns The same assertion with error code added to any errors
 *
 * @example
 * ```typescript
 * const result = withCode('INVALID_EMAIL', invalid("Invalid email format"))
 * console.log(result.error[0].code) // 'INVALID_EMAIL'
 *
 * // Useful for programmatic error handling
 * if (!isValid(result) && result.error[0].code === 'INVALID_EMAIL') {
 *   // Handle email validation specifically
 * }
 * ```
 */
export function withCode<T>(code: string, assertion: Assert<T>): Assert<T> {
  if (isValid(assertion)) return assertion
  return { valid: false, error: assertion.error.map(err => ({ ...err, code })) }
}

/**
 * Adds context information to validation errors.
 *
 * This function enriches validation errors with additional contextual information
 * such as expected vs received values or validation constraints that were violated.
 * Valid assertions pass through unchanged.
 *
 * @template T The type of the value being validated
 * @param context Object containing contextual information about the validation failure
 * @param assertion The Assert result to enhance with context
 * @returns The same assertion with context information added to any errors
 *
 * @example
 * ```typescript
 * const result = withContext(
 *   { received: 'abc', expected: 'number', constraints: { min: 0, max: 100 } },
 *   invalid("Type error")
 * )
 * console.log(result.error[0].context.received) // 'abc'
 * console.log(result.error[0].context.expected) // 'number'
 * ```
 */
export function withContext<T>(
  context: ValidationError['context'],
  assertion: Assert<T>
): Assert<T> {
  if (isValid(assertion)) return assertion
  return { valid: false, error: assertion.error.map(err => ({ ...err, context })) }
}

/**
 * Extracts the value from a valid assertion or throws an error for invalid ones.
 *
 * This function provides a way to "unwrap" validated values from the Assert container.
 * For valid assertions, it returns the contained value. For invalid assertions,
 * it throws an Error with validation details.
 *
 * @template T The type of the value when valid
 * @param x The Assert result to extract the value from
 * @param f Optional custom formatter for error messages
 * @returns The validated value if the assertion is valid
 * @throws Error with validation details if the assertion is invalid
 *
 * @example
 * ```typescript
 * const value = assert(valid(42)) // 42
 *
 * try {
 *   assert(invalid("Validation failed")) // throws Error
 * } catch (error) {
 *   console.log(error.message) // "Validation failed"
 * }
 *
 * // Custom error formatter
 * const customError = (errors) => new TypeError(errors.map(e => e.message).join(', '))
 * assert(invalid("Bad input"), customError) // throws TypeError
 * ```
 */
export function assert<T>(
  x: Assert<T>,
  f?: (errs: readonly ValidationError[]) => Error | string
): T {
  if (isValid(x)) return x.value
  else if (f instanceof Function) throw f(x.error)
  else throw new Error(x.error.map(err => err.message).join('\n'))
}

/**
 * Extracts validation errors from an invalid assertion result.
 *
 * This function provides type-safe access to the error array from invalid assertions.
 * Use this when you need to inspect or process validation errors programmatically.
 *
 * @param x The Invalid assertion result to extract errors from
 * @returns Array of ValidationError objects containing error details
 *
 * @example
 * ```typescript
 * const invalid1 = invalid("error1")
 * const invalid2 = withCode('ERR_CODE', invalid("error2"))
 *
 * const errors1 = errGet(invalid1)
 * console.log(errors1[0].message) // "error1"
 *
 * const errors2 = errGet(invalid2)
 * console.log(errors2[0].code) // 'ERR_CODE'
 * console.log(errors2[0].message) // "error2"
 * ```
 */
export function errGet(x: Invalid): readonly ValidationError[] {
  return x.error
}

/**
 * Appends additional validation errors to an invalid assertion result.
 *
 * This function combines multiple invalid assertion results into a single result
 * containing all errors. Useful for accumulating validation errors from multiple
 * sources or validation steps.
 *
 * @param x The primary Invalid assertion result
 * @param others Additional Invalid assertion results to append
 * @returns A new Invalid result containing all errors from all inputs
 *
 * @example
 * ```typescript
 * const error1 = invalid("First error")
 * const error2 = invalid("Second error")
 * const error3 = invalid("Third error")
 *
 * const combined = errAppend(error1, error2, error3)
 * const allErrors = errGet(combined)
 * console.log(allErrors.length) // 3
 * console.log(allErrors.map(e => e.message)) // ["First error", "Second error", "Third error"]
 * ```
 */
export function errAppend(x: Invalid, ...others: Invalid[]): Invalid {
  const allErrors = [x, ...others].flatMap(inv => inv.error)
  return { valid: false, error: allErrors }
}

/**
 * Joins error messages in an invalid assertion result with a separator.
 *
 * This function consolidates multiple error messages into a single error message,
 * useful for creating summary error messages or when you need a single string
 * representation of all validation failures.
 *
 * @param x The Invalid assertion result containing errors to join
 * @param sep Optional separator string (defaults to comma)
 * @returns A new Invalid result with a single error containing the joined message
 *
 * @example
 * ```typescript
 * const errors = errAppend(invalid("Error 1"), invalid("Error 2"), invalid("Error 3"))
 * const joined = errJoin(errors, "; ")
 *
 * console.log(errGet(joined)[0].message) // "Error 1; Error 2; Error 3"
 *
 * // Default separator (comma)
 * const defaultJoin = errJoin(errors)
 * console.log(errGet(defaultJoin)[0].message) // "Error 1,Error 2,Error 3"
 * ```
 */
export function errJoin(x: Invalid, sep?: string): Invalid {
  const messages = x.error.map(err => err.message)
  const joinedMessage = typeof sep === 'string' ? messages.join(sep) : messages.join()
  return { valid: false, error: [{ message: joinedMessage }] }
}
