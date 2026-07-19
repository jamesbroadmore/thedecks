import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tracks } from '@/lib/db/schema'
import { httpGet } from '@/lib/http'
import { putObject } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXT_FROM_TYPE: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await request.json()
  const { source, downloadUrl, title, artist, license, pageUrl, cover, duration } = body || {}
  if (!downloadUrl || typeof downloadUrl !== 'string')
    return NextResponse.json({ error: 'downloadUrl is required' }, { status: 400 })

  let res
  try {
    res = await httpGet(downloadUrl, { timeout: 60000, maxRedirects: 6, maxBytes: 80 * 1024 * 1024 })
  } catch (err) {
    if ((err as Error)?.message === 'TOO_LARGE')
      return NextResponse.json({ error: 'That track is too large to import (limit 80 MB).' }, { status: 413 })
    return NextResponse.json({ error: 'Could not reach the source' }, { status: 502 })
  }
  if (res.status >= 400) return NextResponse.json({ error: `Source returned ${res.status}` }, { status: 502 })

  const contentType = (String(res.headers['content-type'] || 'audio/mpeg')).split(';')[0]
  const buf = res.body
  if (buf.length === 0) return NextResponse.json({ error: 'Empty file from source' }, { status: 502 })

  const ext =
    EXT_FROM_TYPE[contentType] ||
    (downloadUrl.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1] || 'mp3').toLowerCase()
  const finalType = contentType.startsWith('audio/') ? contentType : `audio/${ext === 'mp3' ? 'mpeg' : ext}`
  const safeTitle = String(title || 'Imported track').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
  const pathname = `users/${userId}/imports/${crypto.randomUUID()}-${safeTitle}.${ext}`
  await putObject(pathname, buf)

  const [row] = await db
    .insert(tracks)
    .values({
      userId,
      title: String(title || 'Imported track'),
      artist: String(artist || 'Unknown Artist'),
      blobPathname: pathname,
      fileName: `${safeTitle}.${ext}`,
      contentType: finalType,
      size: buf.length,
      duration: duration ? Number(duration) : null,
      coverArt: cover || null,
      metadata: {
        source: source || 'catalog',
        license: license || null,
        pageUrl: pageUrl || null,
        importedAt: new Date().toISOString(),
      },
    })
    .returning({ id: tracks.id, title: tracks.title, artist: tracks.artist })
  return NextResponse.json(row, { status: 201 })
}
