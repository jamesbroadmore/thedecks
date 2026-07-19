import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { recordings } from '@/lib/db/schema'
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
      id: recordings.id,
      title: recordings.title,
      duration: recordings.duration,
      createdAt: recordings.createdAt,
    })
    .from(recordings)
    .where(eq(recordings.userId, id))
    .orderBy(desc(recordings.createdAt))
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const id = await userId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'A recording file is required' }, { status: 400 })
  if (file.size > 200 * 1024 * 1024) return NextResponse.json({ error: 'Recording exceeds 200 MB' }, { status: 413 })

  const pathname = `users/${id}/recordings/${crypto.randomUUID()}.webm`
  await putObject(pathname, Buffer.from(await file.arrayBuffer()))
  const [row] = await db
    .insert(recordings)
    .values({
      userId: id,
      title: String(form.get('title') || 'Untitled mix'),
      blobPathname: pathname,
      duration: Number(form.get('duration')) || null,
    })
    .returning({ id: recordings.id, title: recordings.title, duration: recordings.duration, createdAt: recordings.createdAt })
  return NextResponse.json(row, { status: 201 })
}

export async function DELETE(request: Request) {
  const id = await userId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const recId = new URL(request.url).searchParams.get('id')
  if (!recId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const [row] = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.id, recId), eq(recordings.userId, id)))
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await deleteObject(row.blobPathname)
  await db.delete(recordings).where(and(eq(recordings.id, recId), eq(recordings.userId, id)))
  return NextResponse.json({ ok: true })
}
