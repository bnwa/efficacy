import type { IO } from '@lib/io'

import { Task } from '@lib/task/core'
import { taskErr } from '@lib/task/core'
import { taskUpdate } from '@lib/task/core'

export function http(
    uri: string,
    opts: RequestInit = {},
    maxRetryMs = 30000,
    baseRetryMs = 1000,
    retryFactor = 2
) : Task<Response, Pick<IO, "http">> {
  return Task.create(async function*(io: Pick<IO, 'http'>, signal?: AbortSignal) {
    let attempt = 0,
        msg = "",
        ms = 0

    while(ms <= maxRetryMs) {
      try {
        if (signal?.aborted) return yield taskErr(false, String(signal.reason))
        const resp = await io.http(uri, { ...opts, signal })
        if (resp.ok) {
          const lengthVal = resp.headers.get('Content-Length')
          if (lengthVal && resp.body) {
            const maxBytes = parseInt(lengthVal, 10)
            let byteSize = 0
            // TODO Fix type issue
            for await (const chunk of resp.body as any) {
              byteSize += chunk.length
              yield taskUpdate(resp, maxBytes / byteSize, 1)
            }
          }
          return yield taskUpdate(resp, 1, 1)
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

    return yield taskErr(true, msg)
  })
}
