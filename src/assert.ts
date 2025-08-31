export type ValidationError = {
  message: string
  path?: readonly string[]
  code?: string
  context?: Readonly<{
    received?: string
    expected?: string
    constraints?: Record<string, unknown>
  }>
}

export type Valid<T> = Readonly<{ valid: true, value: T }>
export type Invalid = Readonly<{ valid: false, error: readonly ValidationError[] }>
export type Assert<T> = Valid<T> | Invalid

type Validate<T extends unknown[]> = {
  [K in keyof T]: Assert<T[K]>
}


const append = <T>(xs: T[], x: T): T[] => (xs.push(x), xs)


/**
 * Creates a valid assertion result containing the given value.
 *
 * ```typescript
 * const result = valid(42)
 * console.log(result) // { valid: true, value: 42 }
 * ```
 */
export function valid<T>(x: T): Valid<T> {
  return { valid: true, value: x }
}

/**
 * Creates an invalid assertion result with a validation error.
 *
 * ```typescript
 * const result = invalid("Required field missing")
 * ```
 */
export function invalid(message: string): Invalid {
  return { valid: false, error: [{ message }] }
}

/**
 * Type guard to check if an assertion result is valid.
 *
 * ```typescript
 * const result = valid(42)
 * if (isValid(result)) {
 *   console.log(result.value) // 42
 * }
 * ```
 */
export function isValid<T>(x: Assert<T>): x is Valid<T> {
  return x.valid
}

/**
 * Transforms valid values using a function, leaving invalid results unchanged.
 *
 * ```typescript
 * const result = map(valid(5), x => x * 2)
 * console.log(result) // { valid: true, value: 10 }
 * ```
 */
export function map<A, B>(a: Assert<A>, f: (a: A) => B): Assert<B> {
  return isValid(a) ? valid(f(a.value)) : a
}

/**
 * Reduces an array of assertions, accumulating valid results or collecting errors.
 *
 * ```typescript
 * const numbers = [valid(1), valid(2), valid(3)]
 * const sum = fold(numbers, valid(0), (acc, x) => acc + x)
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
 * ```typescript
 * const fn = valid((x: number) => x * 2)
 * const arg = valid(5)
 * const result = apply(fn, arg) // { valid: true, value: 10 }
 * ```
 */
export function apply<A, B>(f: Assert<(a: A) => B>, a: Assert<A>): Assert<B> {
  return isValid(f) ? (isValid(a) ? valid(f.value(a.value)) : a) : f
}

/**
 * Converts an array of assertions into an assertion of an array.
 *
 * ```typescript
 * const assertions = [valid(1), valid(2), valid(3)]
 * const result = sequence(assertions) // { valid: true, value: [1, 2, 3] }
 * ```
 */
export function sequence<T>(assertions: Assert<T>[]): Assert<T[]> {
  return fold(assertions, valid([] as T[]), (acc, x) => [...acc, x])
}

/**
 * Maps each element through a validation function, then sequences the results.
 *
 * ```typescript
 * const items = ['1', '2', '3']
 * const result = traverse(items, x => parseInt(x) ? valid(parseInt(x)) : invalid("Not a number"))
 * ```
 */
export function traverse<A, B>(items: A[], f: (a: A) => Assert<B>): Assert<B[]> {
  return sequence(items.map(f))
}

/**
 * Lifts a pure function to work with validated arguments.
 *
 * ```typescript
 * const add = (a: number, b: number) => a + b
 * const result = lift(add, valid(5), valid(3)) // { valid: true, value: 8 }
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
 * ```typescript
 * const result = withPath(['user', 'email'], invalid("Invalid email"))
 * ```
 */
export function withPath<T>(path: readonly string[], assertion: Assert<T>): Assert<T> {
  if (isValid(assertion)) return assertion
  return { valid: false, error: assertion.error.map(err => ({ ...err, path })) }
}

/**
 * Adds an error code to validation errors.
 *
 * ```typescript
 * const result = withCode('INVALID_EMAIL', invalid("Invalid email format"))
 * ```
 */
export function withCode<T>(code: string, assertion: Assert<T>): Assert<T> {
  if (isValid(assertion)) return assertion
  return { valid: false, error: assertion.error.map(err => ({ ...err, code })) }
}

/**
 * Adds context information to validation errors.
 *
 * ```typescript
 * const result = withContext({ received: 'abc', expected: 'number' }, invalid("Type error"))
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
 * ```typescript
 * const value = assert(valid(42)) // 42
 * assert(invalid("error")) // throws Error with validation details
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
 * ```typescript
 * const errors = errGet(invalid("error1"))
 * console.log(errors[0].message) // "error1"
 * ```
 */
export function errGet(x: Invalid): readonly ValidationError[] {
  return x.error
}

/**
 * Appends additional validation errors to an invalid assertion result.
 *
 * ```typescript
 * const result = errAppend(invalid("first"), invalid("second"))
 * ```
 */
export function errAppend(x: Invalid, ...others: Invalid[]): Invalid {
  const allErrors = [x, ...others].flatMap(inv => inv.error)
  return { valid: false, error: allErrors }
}

/**
 * Joins error messages in an invalid assertion result with a separator.
 *
 * ```typescript
 * const result = errJoin(invalid("error1"), "; ")
 * ```
 */
export function errJoin(x: Invalid, sep?: string): Invalid {
  const messages = x.error.map(err => err.message)
  const joinedMessage = typeof sep === 'string' ? messages.join(sep) : messages.join()
  return { valid: false, error: [{ message: joinedMessage }] }
}
