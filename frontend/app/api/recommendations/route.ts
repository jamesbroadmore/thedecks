import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tracks } from '@/lib/db/schema'
import { getSimilarTracks } from '@/lib/lastfm-client'

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
    const { trackId, limit = 5 } = await request.json()

    const userTracks = await db.select().from(tracks).where(eq(tracks.userId, userId)).limit(100)
    const track = userTracks.find((t) => t.id === trackId)
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

    const similar = await getSimilarTracks(track.title, track.artist, 10)

    const byLastFm = userTracks.filter(
      (t) =>
        t.id !== track.id &&
        similar.some(
          (s) =>
            s.name.toLowerCase() === t.title.toLowerCase() &&
            s.artist.name.toLowerCase() === t.artist.toLowerCase()
        )
    )

    const byBpm = userTracks
      .filter((t) => t.id !== track.id)
      .filter(
        (t) =>
          Math.abs((t.bpm || 120) - (track.bpm || 120)) < 8 ||
          (!!t.genre && t.genre === track.genre)
      )

    const recommendations = (byLastFm.length ? byLastFm : byBpm).slice(0, limit)
    return NextResponse.json({
      recommendations,
      source: byLastFm.length ? 'lastfm' : 'bpm_similarity',
    })
  } catch (error) {
    console.error('[recommendations] POST failed:', error)
    return NextResponse.json({ error: 'Failed to get recommendations' }, { status: 500 })
  }
}
