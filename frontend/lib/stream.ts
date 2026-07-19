import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { NextResponse } from 'next/server'
import { Readable } from 'stream'
import { objectAbsolutePath, objectStat } from '@/lib/storage'

export interface StreamSource {
  url?: string | null
  pathname?: string | null
  localPath?: string | null
  contentType: string
  disposition?: string
}

const notFound = () => new NextResponse('Not found', { status: 404 })

/**
 * Streams a stored object with HTTP range support, transparently handling both
 * Vercel Blob (remote URL) and local-filesystem backends.
 */
export async function streamStored(request: Request, src: StreamSource): Promise<Response> {
  const range = request.headers.get('range')

  // Vercel Blob (remote CDN URL) — proxy the range request straight through.
  if (src.url) {
    const upstream = await fetch(src.url, {
      headers: range ? { range } : {},
      cache: 'no-store',
    })
    if (!upstream.ok && upstream.status !== 206) return notFound()
    const headers = new Headers()
    headers.set('Content-Type', src.contentType)
    const cl = upstream.headers.get('content-length')
    if (cl) headers.set('Content-Length', cl)
    const cr = upstream.headers.get('content-range')
    if (cr) headers.set('Content-Range', cr)
    headers.set('Accept-Ranges', 'bytes')
    headers.set('Cache-Control', 'private, no-cache')
    if (src.disposition) headers.set('Content-Disposition', src.disposition)
    return new NextResponse(upstream.body, { status: upstream.status, headers })
  }

  // Local filesystem backend.
  let absPath: string
  let size: number
  if (src.pathname) {
    const st = await objectStat(src.pathname)
    if (!st) return notFound()
    absPath = objectAbsolutePath(src.pathname)
    size = st.size
  } else if (src.localPath) {
    try {
      const st = await stat(src.localPath)
      absPath = src.localPath
      size = st.size
    } catch {
      return notFound()
    }
  } else {
    return notFound()
  }

  const baseHeaders: Record<string, string> = {
    'Content-Type': src.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-cache',
  }
  if (src.disposition) baseHeaders['Content-Disposition'] = src.disposition

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    let start = match && match[1] ? parseInt(match[1], 10) : 0
    let end = match && match[2] ? parseInt(match[2], 10) : size - 1
    if (Number.isNaN(start)) start = 0
    if (Number.isNaN(end) || end >= size) end = size - 1
    if (start > end || start >= size)
      return new NextResponse('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    const stream = Readable.toWeb(createReadStream(absPath, { start, end })) as unknown as ReadableStream
    return new NextResponse(stream, {
      status: 206,
      headers: { ...baseHeaders, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
    })
  }

  const stream = Readable.toWeb(createReadStream(absPath)) as unknown as ReadableStream
  return new NextResponse(stream, { status: 200, headers: { ...baseHeaders, 'Content-Length': String(size) } })
}
