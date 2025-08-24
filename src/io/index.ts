import * as FileIO from './file'
import * as HttpIO from './http'
import * as StrIO from './str'

export type IO = typeof io

export const io = {
  ...FileIO,
  ...HttpIO,
  ...StrIO,
} as const
