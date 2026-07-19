import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tracks } from '@/lib/db/schema'
import { enrichTrack } from '@/lib/metadata-enricher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const { trackId } = await request.json()
    const [track] = await db
      .select()
      .from(tracks)
      .where(and(eq(tracks.id, trackId), eq(tracks.userId, userId)))
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

    const enriched = await enrichTrack(track.title, track.artist, track.bpm ?? undefined)
    await db
      .update(tracks)
      .set({
        title: enriched.title,
        artist: enriched.artist,
        isrc: (enriched as any).isrc ?? track.isrc,
        coverArt: (enriched as any).coverArt ?? track.coverArt,
        metadata: (enriched as any).metadata ?? track.metadata,
        updatedAt: new Date(),
      })
      .where(and(eq(tracks.id, trackId), eq(tracks.userId, userId)))
    return NextResponse.json({ success: true, enriched })
  } catch (error) {
    console.error('[enrich] POST failed:', error)
    return NextResponse.json({ error: 'Enrichment failed' }, { status: 500 })
  }
}
