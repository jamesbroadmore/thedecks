import fetch from 'node-fetch'

interface MusicBrainzRecording {
  id: string
  title: string
  'artist-credit'?: Array<{ name: string }>
  releases?: Array<{ id: string; title: string; 'cover-art-archive'?: { front: boolean } }>
}

interface MusicBrainzRelease {
  id: string
  'cover-art-archive'?: { front: boolean; artwork: boolean }
}

export async function lookupMusicBrainz(title: string, artist: string) {
  try {
    const query = `recording:"${title}" artist:"${artist}"`
    const url = new URL('https://musicbrainz.org/ws/2/recording/')
    url.searchParams.set('query', query)
    url.searchParams.set('fmt', 'json')
    url.searchParams.set('limit', '1')

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'thedecks-by-4music2/1.0' },
    })
    const data = (await response.json()) as { recordings: MusicBrainzRecording[] }

    if (data.recordings?.[0]) {
      const rec = data.recordings[0]
      const releaseId = rec.releases?.[0]?.id
      return {
        mbRecordingId: rec.id,
        mbReleaseId: releaseId,
        title: rec.title,
        artist: rec['artist-credit']?.[0]?.name || artist,
      }
    }
  } catch (err) {
    console.error('[enricher] MusicBrainz lookup failed:', err)
  }
  return null
}

export async function getCoverArtUrl(mbReleaseId: string) {
  try {
    const url = `https://coverartarchive.org/release/${mbReleaseId}/front`
    const response = await fetch(url, { redirect: 'follow' })
    if (response.ok) return response.url
  } catch (err) {
    console.error('[enricher] Cover art lookup failed:', err)
  }
  return null
}

export async function enrichTrack(
  title: string,
  artist: string,
  bpm?: number
) {
  const mb = await lookupMusicBrainz(title, artist)
  if (!mb) return { title, artist }

  let coverArt: string | null = null
  if (mb.mbReleaseId) {
    coverArt = await getCoverArtUrl(mb.mbReleaseId)
  }

  return {
    title: mb.title,
    artist: mb.artist,
    isrc: mb.mbRecordingId,
    coverArt,
    metadata: {
      mbRecordingId: mb.mbRecordingId,
      mbReleaseId: mb.mbReleaseId,
      source: 'musicbrainz',
      enrichedAt: new Date().toISOString(),
    },
  }
}
