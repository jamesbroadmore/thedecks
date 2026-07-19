import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { recordings } from '@/lib/db/schema'
import { streamStored } from '@/lib/stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const [rec] = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.id, id), eq(recordings.userId, session.user.id)))
  if (!rec) return new NextResponse('Not found', { status: 404 })

  const safeName = rec.title.replace(/[^a-zA-Z0-9._-]/g, '_')
  return streamStored(request, {
    url: rec.blobUrl,
    pathname: rec.blobPathname,
    contentType: 'audio/webm',
    disposition: `attachment; filename="${safeName}.webm"`,
  })
}
