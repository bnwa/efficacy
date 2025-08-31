import { test, expect } from "bun:test"

import type { Assert, ValidationError } from '@lib/assert'
import { isValid } from '@lib/assert'
import { invalid } from '@lib/assert'
import { assert } from '@lib/assert'
import { lift } from '@lib/assert'
import { valid } from '@lib/assert'
import { fold } from '@lib/assert'
import { map } from '@lib/assert'
import { apply } from '@lib/assert'
import { sequence } from '@lib/assert'
import { traverse } from '@lib/assert'
import { withPath } from '@lib/assert'
import { withCode } from '@lib/assert'
import { withContext } from '@lib/assert'


type TestError = {
  message: string
  canRetry: boolean
}

type Sex = 'm' | 'f'

class Person {
  constructor(public age: number, public sex: Sex) {}
  static of(age: number, sex: Sex) {
    return new Person(age, sex)
  }
}


function verifyIdentityLaw<T>(value: Assert<T>): boolean {
  const identity = (x: T): T => x
  const applied = apply(valid(identity), value)

  if (isValid(value) && isValid(applied)) {
    return value.value === applied.value
  } else if (!isValid(value) && !isValid(applied)) {
    return true
  }
  return false
}

function verifyHomomorphismLaw<A, B>(f: (a: A) => B, x: A): boolean {
  const left = apply(valid(f), valid(x))
  const right = valid(f(x))

  if (isValid(left) && isValid(right)) {
    return left.value === right.value
  }
  return false
}

function verifyInterchangeLaw<A, B>(u: Assert<(a: A) => B>, y: A): boolean {
  const left = apply(u, valid(y))
  const right = apply(valid((f: (a: A) => B) => f(y)), u)

  if (isValid(left) && isValid(right)) {
    return left.value === right.value
  } else if (!isValid(left) && !isValid(right)) {
    return true
  }
  return false
}


test('map transforms valid values and preserves invalid values', () => {
  const v = valid("42")
  const f = (a: string) => parseInt(a, 10)
  const n = map(v, f)
  expect(isValid(n)).toBeTrue()
  expect(assert(n)).toBeNumber()

  const err = invalid("Invalid value")
  const res = map(err, f)
  expect(isValid(res)).toBeFalse()
  expect(() => assert(res)).toThrowError("Invalid value")
})

test('fold reduces valid values and accumulates errors', () => {
  const sum = (a: number, b: number) => a + b

  const resultsA = [
    valid(1),
    valid(2),
    valid(3),
    valid(4),
  ]
  const resA = assert(fold(resultsA, valid(0), sum))
  expect(resA).toStrictEqual(10)

  const resultsB = [
    valid(25),
    invalid("ErrA"),
    valid(12.5),
  ]
  expect(() => assert(fold(resultsB, valid(0), sum)))
    .toThrowError("ErrA")
})

test('lift applies functions to validated arguments', () => {
  expect(assert(lift(Person.of, valid(25), valid('m' as Sex))))
    .toBeInstanceOf(Person)
  expect(() => assert(lift(Person.of, invalid("Age was NaN"), valid('m' as Sex))))
    .toThrowError("Age was NaN")
})

test('sequence converts array of assertions to assertion of array', () => {
  const validAssertions = [valid(1), valid(2), valid(3)]
  const result = sequence(validAssertions)
  expect(isValid(result)).toBeTrue()
  expect(assert(result)).toEqual([1, 2, 3])

  const mixedAssertions = [valid(1), invalid("error"), valid(3)]
  const errorResult = sequence(mixedAssertions)
  expect(isValid(errorResult)).toBeFalse()
  expect(() => assert(errorResult)).toThrowError("error")
})

test('traverse maps and sequences in one operation', () => {
  const items = ['1', '2', '3']
  const parseNumber = (x: string) => {
    const parsed = parseInt(x, 10)
    return isNaN(parsed) ? invalid("Not a number") : valid(parsed)
  }

  const result = traverse(items, parseNumber)
  expect(isValid(result)).toBeTrue()
  expect(assert(result)).toEqual([1, 2, 3])

  const invalidItems = ['1', 'abc', '3']
  const errorResult = traverse(invalidItems, parseNumber)
  expect(isValid(errorResult)).toBeFalse()
  expect(() => assert(errorResult)).toThrowError("Not a number")
})

test('withPath adds path information to validation errors', () => {
  const baseError = invalid("Field required")
  const withPathError = withPath(['user', 'email'], baseError)

  expect(isValid(withPathError)).toBeFalse()
  if (!isValid(withPathError) && withPathError.error.length > 0) {
    expect(withPathError.error[0]?.path).toEqual(['user', 'email'])
    expect(withPathError.error[0]?.message).toBe("Field required")
  }

  const validValue = valid(42)
  const pathOnValid = withPath(['test'], validValue)
  expect(isValid(pathOnValid)).toBeTrue()
  expect(assert(pathOnValid)).toBe(42)
})

test('withCode adds error codes to validation errors', () => {
  const baseError = invalid("Invalid email format")
  const withCodeError = withCode('INVALID_EMAIL', baseError)

  expect(isValid(withCodeError)).toBeFalse()
  if (!isValid(withCodeError) && withCodeError.error.length > 0) {
    expect(withCodeError.error[0]?.code).toBe('INVALID_EMAIL')
    expect(withCodeError.error[0]?.message).toBe("Invalid email format")
  }

  const validValue = valid("test@example.com")
  const codeOnValid = withCode('VALID_EMAIL', validValue)
  expect(isValid(codeOnValid)).toBeTrue()
  expect(assert(codeOnValid)).toBe("test@example.com")
})

test('withContext adds context information to validation errors', () => {
  const context = { received: 'abc', expected: 'number' }
  const baseError = invalid("Type mismatch")
  const withContextError = withContext(context, baseError)

  expect(isValid(withContextError)).toBeFalse()
  if (!isValid(withContextError) && withContextError.error.length > 0) {
    expect(withContextError.error[0]?.context).toEqual(context)
    expect(withContextError.error[0]?.message).toBe("Type mismatch")
  }

  const validValue = valid(123)
  const contextOnValid = withContext(context, validValue)
  expect(isValid(contextOnValid)).toBeTrue()
  expect(assert(contextOnValid)).toBe(123)
})

test('composable error building pattern', () => {
  const result = withPath(['user', 'profile', 'email'],
    withCode('INVALID_EMAIL',
      withContext({ received: 'not-an-email', expected: 'email format' },
        invalid("Invalid email address")
      )
    )
  )

  expect(isValid(result)).toBeFalse()
  if (!isValid(result) && result.error.length > 0) {
    const error = result.error[0]
    expect(error?.message).toBe("Invalid email address")
    expect(error?.path).toEqual(['user', 'profile', 'email'])
    expect(error?.code).toBe('INVALID_EMAIL')
    expect(error?.context?.received).toBe('not-an-email')
    expect(error?.context?.expected).toBe('email format')
  }
})

test('applicative identity law', () => {
  expect(verifyIdentityLaw(valid(42))).toBe(true)
  expect(verifyIdentityLaw(invalid("error"))).toBe(true)
})

test('applicative homomorphism law', () => {
  const double = (x: number) => x * 2
  expect(verifyHomomorphismLaw(double, 5)).toBe(true)
})

test('applicative interchange law', () => {
  const double = (x: number) => x * 2
  expect(verifyInterchangeLaw(valid(double), 5)).toBe(true)
  expect(verifyInterchangeLaw(invalid("error"), 5)).toBe(true)
})

test('ValidationError structure contains all required fields', () => {
  const error: ValidationError = {
    message: "Test error",
    path: ['field'],
    code: 'TEST_ERROR',
    context: {
      received: 'invalid',
      expected: 'valid',
      constraints: { minLength: 5 }
    }
  }

  expect(error.message).toBe("Test error")
  expect(error.path).toEqual(['field'])
  expect(error.code).toBe('TEST_ERROR')
  expect(error.context?.received).toBe('invalid')
  expect(error.context?.expected).toBe('valid')
  expect(error.context?.constraints?.minLength).toBe(5)
})

test('Assert discriminated union structure', () => {
  const validResult = valid(42)
  expect(validResult.valid).toBe(true)
  if (validResult.valid) {
    expect(validResult.value).toBe(42)
  }

  const invalidResult = invalid("Test error")
  expect(invalidResult.valid).toBe(false)
  if (!invalidResult.valid) {
    expect(invalidResult.error).toHaveLength(1)
    expect(invalidResult.error[0]?.message).toBe("Test error")
  }
})
