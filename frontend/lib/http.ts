// Thin HTTP helper built on Node's native http/https modules.
// Next.js patches the global `fetch`, and that patched fetch fails against some
// upstream hosts (e.g. archive.org / ccmixter.org) inside the server runtime.
// Using the native modules bypasses that patch entirely.
import http from 'http'
import https from 'https'

const UA = 'thedecks-by-4music2/1.0 (open-source catalog)'

export interface HttpResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: Buffer
}

export function httpGet(
  url: string,
  opts: { timeout?: number; maxRedirects?: number; maxBytes?: number } = {}
): Promise<HttpResponse> {
  const { timeout = 20000, maxRedirects = 5, maxBytes = Infinity } = opts
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    let u: URL
    try {
      u = new URL(url)
    } catch (e) {
      return reject(e)
    }
    const mod = u.protocol === 'http:' ? http : https
    const req = mod.request(
      u,
      {
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          // Some hosts (e.g. ccMixter) block hotlinking without a same-origin referer.
          Referer: `${u.origin}/`,
        },
        timeout,
        maxHeaderSize: 262144,
      },
      (res) => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location && maxRedirects > 0) {
          res.resume()
          const next = new URL(res.headers.location, url).toString()
          return httpGet(next, { timeout, maxRedirects: maxRedirects - 1, maxBytes }).then(
            (r) => done(() => resolve(r)),
            (e) => done(() => reject(e))
          )
        }
        const contentLength = Number(res.headers['content-length'] || 0)
        if (contentLength && contentLength > maxBytes) {
          res.destroy()
          return done(() => reject(new Error('TOO_LARGE')))
        }
        const chunks: Buffer[] = []
        let total = 0
        res.on('data', (c: Buffer) => {
          total += c.length
          if (total > maxBytes) {
            res.destroy()
            return done(() => reject(new Error('TOO_LARGE')))
          }
          chunks.push(c)
        })
        res.on('end', () => done(() => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) })))
        res.on('error', (e) => done(() => reject(e)))
      }
    )
    req.on('error', (e) => done(() => reject(e)))
    req.on('timeout', () => req.destroy(new Error('Request timed out')))
    req.end()
  })
}

export async function httpGetJson(url: string, opts: { timeout?: number } = {}): Promise<any> {
  const res = await httpGet(url, opts)
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
  return JSON.parse(res.body.toString('utf8'))
}
