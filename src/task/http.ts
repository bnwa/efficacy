import type { IO } from '@lib/io'

import { Task, success, failure } from '@lib/task/core'

// Define HTTP-specific error type
export type HttpError = {
  message: string
  status?: number
  canRetry: boolean
}

export function http(
    uri: string,
    opts: RequestInit = {},
    maxRetryMs = 30000,
    baseRetryMs = 1000,
    retryFactor = 2
): Task<Response, HttpError, Pick<IO, "http">> {
  return Task.create(async function*(io: Pick<IO, 'http'>, signal?: AbortSignal) {
    let attempt = 0
    let msg = ""
    let ms = 0

    while(ms <= maxRetryMs) {
      try {
        if (signal?.aborted) {
          return yield failure<Response, HttpError>({ 
            message: String(signal.reason), 
            canRetry: false 
          })
        }
        
        const resp = await io.http(uri, { ...opts, signal })
        if (resp.ok) {
          const lengthVal = resp.headers.get('Content-Length')
          if (lengthVal && resp.body) {
            const maxBytes = parseInt(lengthVal, 10)
            let byteSize = 0
            // TODO Fix type issue
            for await (const chunk of resp.body as any) {
              byteSize += chunk.length
              yield success(resp, { total: maxBytes, current: byteSize })
            }
          }
          return yield success(resp, { total: 1, current: 1 })
        }
        msg = resp.statusText
      } catch(err) {
        if (err instanceof Error) msg = err.message
        else msg = String(err)
      }
      
      ms = Math.min(
        baseRetryMs * Math.pow(retryFactor, attempt++),
        maxRetryMs
      )
      
      await new Promise(done => {
        const tId = setTimeout(done, ms)
        if (signal) {
          signal.addEventListener('abort', () => clearTimeout(tId))
        }
      })
    }

    return yield failure<Response, HttpError>({ 
      message: msg, 
      canRetry: true 
    })
  })
}
