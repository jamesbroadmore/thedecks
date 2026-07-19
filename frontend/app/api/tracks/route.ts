import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tracks } from '@/lib/db/schema'
import { deleteObject, putObject } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function userId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user.id
}

export async function GET() {
  const id = await userId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      artist: tracks.artist,
      fileName: tracks.fileName,
      contentType: tracks.contentType,
      size: tracks.size,
      duration: tracks.duration,
      bpm: tracks.bpm,
      musicalKey: tracks.musicalKey,
      coverArt: tracks.coverArt,
      genre: tracks.genre,
      deviceSourceId: tracks.deviceSourceId,
      metadata: tracks.metadata,
      createdAt: tracks.createdAt,
    })
    .from(tracks)
    .where(eq(tracks.userId, id))
    .orderBy(desc(tracks.createdAt))
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const id = await userId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File) || !file.type.startsWith('audio/'))
    return NextResponse.json({ error: 'A valid audio file is required' }, { status: 400 })
  if (file.size > 250 * 1024 * 1024)
    return NextResponse.json({ error: 'File exceeds 250 MB' }, { status: 413 })

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const pathname = `users/${id}/tracks/${crypto.randomUUID()}-${safe}`
  const stored = await putObject(pathname, Buffer.from(await file.arrayBuffer()), file.type)

  const [row] = await db
    .insert(tracks)
    .values({
      userId: id,
      title: String(form.get('title') || file.name.replace(/\.[^.]+$/, '')),
      artist: String(form.get('artist') || 'Unknown Artist'),
      blobPathname: stored.pathname,
      blobUrl: stored.url,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      duration: Number(form.get('duration')) || null,
      bpm: Number(form.get('bpm')) || null,
      musicalKey: String(form.get('musicalKey') || '') || null,
      genre: String(form.get('genre') || '') || null,
      metadata: { source: 'upload' },
    })
    .returning({
      id: tracks.id,
      title: tracks.title,
      artist: tracks.artist,
      duration: tracks.duration,
      bpm: tracks.bpm,
      musicalKey: tracks.musicalKey,
    })
  return NextResponse.json(row, { status: 201 })
}

export async function DELETE(request: Request) {
  const id = await userId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const trackId = new URL(request.url).searchParams.get('id')
  if (!trackId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const [row] = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.id, trackId), eq(tracks.userId, id)))
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await deleteObject(row.blobPathname, row.blobUrl)
  await db.delete(tracks).where(and(eq(tracks.id, trackId), eq(tracks.userId, id)))
  return NextResponse.json({ ok: true })
}
