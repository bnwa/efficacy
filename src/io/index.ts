import * as FileIO from './file'
import * as HttpIO from './http'
import * as StrIO from './str'

type BaseIO =
  typeof FileIO &
  typeof HttpIO &
  typeof StrIO

export interface IO extends BaseIO {
}

export const io = {
  ...FileIO,
  ...HttpIO,
  ...StrIO,
} as const
