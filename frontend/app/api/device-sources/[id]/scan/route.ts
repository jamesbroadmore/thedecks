import { and, eq } from 'drizzle-orm'
import { readdir, stat } from 'fs/promises'
import { extname, join } from 'path'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { parseFile } from 'music-metadata'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { deviceSources, tracks } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.wma', '.aiff', '.aif'])
const CONTENT_TYPE: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.wma': 'audio/x-ms-wma',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
}

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

async function* walk(dir: string, depth = 0): AsyncGenerator<string> {
  if (depth > 6) return
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full, depth + 1)
    } else if (AUDIO_EXT.has(extname(entry.name).toLowerCase())) {
      yield full
    }
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserId()
    const { id } = await params
    const [source] = await db
      .select()
      .from(deviceSources)
      .where(and(eq(deviceSources.id, id), eq(deviceSources.userId, userId)))
    if (!source) return NextResponse.json({ error: 'Device source not found' }, { status: 404 })

    const existing = await db
      .select({ localPath: tracks.localPath })
      .from(tracks)
      .where(eq(tracks.userId, userId))
    const known = new Set(existing.map((t) => t.localPath).filter(Boolean) as string[])

    let scanned = 0
    let skipped = 0
    const imported: { title: string; artist: string }[] = []

    for await (const file of walk(source.path)) {
      if (known.has(file)) {
        skipped++
        continue
      }
      try {
        const st = await stat(file)
        const ext = extname(file).toLowerCase()
        const baseName = (file.split('/').pop() || 'Untitled').replace(/\.[^.]+$/, '')
        const nameParts = baseName.split(' - ')
        let title = nameParts.length > 1 ? nameParts.slice(1).join(' - ') : baseName
        let artist = nameParts.length > 1 ? nameParts[0] : 'Unknown Artist'
        let duration: number | null = null
        let bpm: number | null = null
        let musicalKey: string | null = null
        let genre: string | null = null
        try {
          const meta = await parseFile(file, { duration: true })
          if (meta.common?.title) title = meta.common.title
          if (meta.common?.artist) artist = meta.common.artist
          duration = meta.format?.duration ?? null
          bpm = (meta.common as any)?.bpm ?? null
          musicalKey = meta.common?.key ?? null
          genre = meta.common?.genre?.[0] ?? null
        } catch {
          /* fall back to filename metadata */
        }
        await db.insert(tracks).values({
          userId,
          title,
          artist,
          fileName: file.split('/').pop() || 'track',
          contentType: CONTENT_TYPE[ext] || 'audio/mpeg',
          size: st.size,
          duration,
          bpm,
          musicalKey,
          genre,
          deviceSourceId: id,
          localPath: file,
          metadata: { source: 'device_scan', deviceLabel: source.label },
        })
        scanned++
        imported.push({ title, artist })
        known.add(file)
      } catch (err) {
        console.error('[scan] failed on', file, err)
      }
    }

    await db.update(deviceSources).set({ lastScanned: new Date() }).where(eq(deviceSources.id, id))
    return NextResponse.json({ success: true, scanned, skipped, imported })
  } catch (error) {
    console.error('[scan] POST failed:', error)
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 })
  }
}
