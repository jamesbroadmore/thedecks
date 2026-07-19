import fetch from 'node-fetch'

interface LastFmTrack {
  name: string
  artist: { name: string }
  album: { title: string }
  url: string
  duration?: number
  listeners?: number
  playcount?: number
}

interface LastFmArtist {
  name: string
  bio?: { summary: string }
  image?: Array<{ '#text': string; size: string }>
  listeners?: string
  playcount?: string
}

const API_KEY = process.env.LASTFM_API_KEY
const BASE_URL = 'http://ws.audioscrobbler.com/2.0/'

export async function getTrackInfo(
  track: string,
  artist: string
): Promise<LastFmTrack | null> {
  if (!API_KEY) return null

  try {
    const url = new URL(BASE_URL)
    url.searchParams.set('method', 'track.getInfo')
    url.searchParams.set('track', track)
    url.searchParams.set('artist', artist)
    url.searchParams.set('api_key', API_KEY)
    url.searchParams.set('format', 'json')

    const response = await fetch(url.toString())
    const data = (await response.json()) as { track?: LastFmTrack; error?: number }

    return data.track || null
  } catch (err) {
    console.error('[lastfm] Track info failed:', err)
    return null
  }
}

export async function getArtistInfo(artist: string): Promise<LastFmArtist | null> {
  if (!API_KEY) return null

  try {
    const url = new URL(BASE_URL)
    url.searchParams.set('method', 'artist.getInfo')
    url.searchParams.set('artist', artist)
    url.searchParams.set('api_key', API_KEY)
    url.searchParams.set('format', 'json')

    const response = await fetch(url.toString())
    const data = (await response.json()) as { artist?: LastFmArtist; error?: number }

    return data.artist || null
  } catch (err) {
    console.error('[lastfm] Artist info failed:', err)
    return null
  }
}

export async function getSimilarTracks(
  track: string,
  artist: string,
  limit = 5
): Promise<LastFmTrack[]> {
  if (!API_KEY) return []

  try {
    const url = new URL(BASE_URL)
    url.searchParams.set('method', 'track.getSimilar')
    url.searchParams.set('track', track)
    url.searchParams.set('artist', artist)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('api_key', API_KEY)
    url.searchParams.set('format', 'json')

    const response = await fetch(url.toString())
    const data = (await response.json()) as { similartracks?: { track: LastFmTrack[] } }

    return data.similartracks?.track || []
  } catch (err) {
    console.error('[lastfm] Similar tracks failed:', err)
    return []
  }
}
