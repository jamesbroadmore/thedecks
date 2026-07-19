import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  CatalogItem,
  CatalogSource,
  searchCcMixter,
  searchInternetArchive,
  searchJamendo,
} from '@/lib/catalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json({ error: 'A search query is required' }, { status: 400 })

  const requested = (url.searchParams.get('sources') || 'internet_archive,ccmixter,jamendo')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as CatalogSource[]

  const jobs: Promise<CatalogItem[]>[] = []
  if (requested.includes('internet_archive')) jobs.push(searchInternetArchive(q))
  if (requested.includes('ccmixter')) jobs.push(searchCcMixter(q))
  if (requested.includes('jamendo')) jobs.push(searchJamendo(q))

  const settled = await Promise.all(jobs.map((p) => p.catch(() => [] as CatalogItem[])))
  const results = settled.flat()

  const notes: string[] = []
  if (requested.includes('jamendo') && !process.env.JAMENDO_CLIENT_ID) {
    notes.push('Jamendo is disabled — add JAMENDO_CLIENT_ID to enable it.')
  }

  return NextResponse.json({
    query: q,
    count: results.length,
    results,
    notes,
  })
}
