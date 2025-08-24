export async function http(uri: string, opts: RequestInit = {}) {
  try { return await fetch(uri, opts) }
  catch(err) { return Promise.reject(
    err instanceof Error ?
      err.message :
      String(err))
  }
}
