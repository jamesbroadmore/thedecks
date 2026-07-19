// Open-source / free music catalog integrations.
// - Internet Archive  (no key)  https://archive.org
// - ccMixter          (no key)  https://ccmixter.org  (remix / stems community)
// - Jamendo           (client_id) https://developer.jamendo.com

import { httpGetJson } from '@/lib/http'

export type CatalogSource = 'internet_archive' | 'ccmixter' | 'jamendo'

export interface CatalogItem {
  id: string
  source: CatalogSource
  title: string
  artist: string
  license: string | null
  downloadUrl: string
  previewUrl: string | null
  pageUrl: string | null
  cover: string | null
  duration: number | null
}

async function fetchJson(url: string, opts: { timeout?: number; retries?: number } = {}): Promise<any> {
  const { timeout = 12000, retries = 1 } = opts
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await httpGetJson(url, { timeout })
    } catch (err) {
      lastErr = err
      console.error(`[catalog] fetch attempt ${attempt + 1} failed for ${url}:`, (err as Error)?.message)
    }
  }
  throw lastErr
}

function first<T>(v: T | T[] | undefined | null): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined)
}

export async function searchInternetArchive(q: string, limit = 6): Promise<CatalogItem[]> {
  try {
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
      `(${q}) AND mediatype:audio`
    )}&fl[]=identifier&fl[]=title&fl[]=creator&rows=${limit}&output=json`
    const data = await fetchJson(url, { timeout: 12000, retries: 1 })
    const docs: any[] = data?.response?.docs ?? []

    const items = await Promise.all(
      docs.map(async (d) => {
        try {
          const meta = await fetchJson(`https://archive.org/metadata/${d.identifier}`, {
            timeout: 12000,
            retries: 1,
          })
          const files: any[] = meta?.files ?? []
          const pick =
            files.find((f) => /\.mp3$/i.test(f.name)) ||
            files.find((f) => /\.ogg$/i.test(f.name)) ||
            files.find((f) => /\.(m4a|flac|wav)$/i.test(f.name))
          if (!pick) return null
          const dl = `https://archive.org/download/${d.identifier}/${encodeURIComponent(pick.name)}`
          return {
            id: `ia:${d.identifier}:${pick.name}`,
            source: 'internet_archive' as const,
            title: (first<string>(d.title) as string) || d.identifier,
            artist: (first<string>(d.creator) as string) || 'Internet Archive',
            license: 'Public domain / various (see item page)',
            downloadUrl: dl,
            previewUrl: dl,
            pageUrl: `https://archive.org/details/${d.identifier}`,
            cover: `https://archive.org/services/img/${d.identifier}`,
            duration: pick.length ? Math.round(parseFloat(pick.length)) || null : null,
          }
        } catch {
          return null
        }
      })
    )
    return items.filter(Boolean) as CatalogItem[]
  } catch {
    return []
  }
}

export async function searchCcMixter(q: string, limit = 12): Promise<CatalogItem[]> {
  try {
    const url = `https://ccmixter.org/api/query?f=json&limit=${limit}&search=${encodeURIComponent(
      q
    )}&sort=rank&search_type=all`
    const data = await fetchJson(url, { timeout: 16000, retries: 1 })
    const rows: any[] = Array.isArray(data) ? data : []
    return rows
      .map((u) => {
        const files: any[] = (u.files ?? []).filter((f: any) => f.download_url)
        const pick = files.find((f) => /\.mp3$/i.test(f.download_url)) || files[0]
        const dl: string | undefined = pick?.download_url
        if (!dl) return null
        const https = dl.startsWith('https')
        return {
          id: `cc:${u.upload_id}`,
          source: 'ccmixter' as const,
          title: u.upload_name || 'Untitled',
          artist: u.user_real_name || u.user_name || 'ccMixter artist',
          license: u.license_name || 'Creative Commons',
          downloadUrl: dl,
          previewUrl: https ? dl : null,
          pageUrl: u.file_page_url || u.artist_page_url || null,
          cover: null,
          duration: null,
        }
      })
      .filter(Boolean) as CatalogItem[]
  } catch {
    return []
  }
}

export async function searchJamendo(q: string, limit = 12): Promise<CatalogItem[]> {
  const cid = process.env.JAMENDO_CLIENT_ID
  if (!cid) return []
  try {
    const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${cid}&format=json&limit=${limit}&search=${encodeURIComponent(
      q
    )}&audioformat=mp32&include=musicinfo`
    const data = await fetchJson(url, { timeout: 12000, retries: 1 })
    const rows: any[] = data?.results ?? []
    return rows
      .filter((r) => r.audiodownload || r.audio)
      .map((r) => ({
        id: `jam:${r.id}`,
        source: 'jamendo' as const,
        title: r.name || 'Untitled',
        artist: r.artist_name || 'Jamendo artist',
        license: 'Creative Commons',
        downloadUrl: r.audiodownload || r.audio,
        previewUrl: r.audio || null,
        pageUrl: r.shareurl || null,
        cover: r.album_image || r.image || null,
        duration: r.duration ? Number(r.duration) : null,
      })) as CatalogItem[]
  } catch {
    return []
  }
}
