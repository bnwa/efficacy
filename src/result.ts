export type Success<T> = { ok: true,   value: T }
export type Failure<E> = { ok: false,  error: E }

export type Result<T, E> =
  | Success<T>
  | Failure<E>

export function ok<T, E = never>(value: T) : Result<T,E> {
  return { ok: true, value }
}

export function fail<T, E>(error: E) : Result<T,E> {
  return { ok: false, error }
}

export function isFailure<T,E>(result: Result<T,E>) : result is Failure<E> {
  return !result.ok
}

