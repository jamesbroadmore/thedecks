import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { deviceSources } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET() {
  try {
    const userId = await getUserId()
    const rows = await db.select().from(deviceSources).where(eq(deviceSources.userId, userId))
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const { type, path, label } = await request.json()
    if (!['local_folder', 'smb_share', 'nfs_share'].includes(type))
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    if (!path || typeof path !== 'string')
      return NextResponse.json({ error: 'A path is required' }, { status: 400 })
    const [row] = await db
      .insert(deviceSources)
      .values({ userId, type, path, label: label || path, enabled: true })
      .returning()
    return NextResponse.json(row, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create source' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getUserId()
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await db.delete(deviceSources).where(and(eq(deviceSources.id, id), eq(deviceSources.userId, userId)))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 })
  }
}
