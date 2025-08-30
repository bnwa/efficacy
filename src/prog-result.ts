import type { Failure } from '@lib/result'
import type { Success } from '@lib/result'

export type Progress = {
  total?: number
  current?: number
}

export type ProgressOk<T> = Success<T> & { progress?: Progress }

export type ProgressFail<E> = Failure<E> & { progress?: Progress }

export type ProgressResult<T, E> =
  | ProgressOk<T>
  | ProgressFail<E>


export function ok<T, E = never>(value: T, progress?: Progress) : ProgressResult<T, E> {
  return { ok: true, value, progress }
}

export function fail<T,E>(error: E, progress?: Progress) : ProgressResult<T, E> {
  return { ok: false, error, progress }
}

export function isFailure<T,E>(result: ProgressResult<T,E>) : result is ProgressFail<E> {
  return !result.ok
}
