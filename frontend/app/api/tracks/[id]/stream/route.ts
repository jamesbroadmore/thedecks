import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tracks } from '@/lib/db/schema'
import { streamStored } from '@/lib/stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const [track] = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.id, id), eq(tracks.userId, session.user.id)))
  if (!track) return new NextResponse('Not found', { status: 404 })

  return streamStored(request, {
    url: track.blobUrl,
    pathname: track.blobPathname,
    localPath: track.localPath,
    contentType: track.contentType || 'audio/mpeg',
  })
}
