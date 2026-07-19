import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SYSTEM =
  'You are the concise performance assistant for "the decks by 4{music}2", a DJ workstation. ' +
  'Recommend only tracks present in the supplied user library; never invent availability. ' +
  'Give practical DJ transition, harmonic-mixing or set-building advice in 3 short sentences or fewer.'

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI assistant is not configured.' }, { status: 503 })

  const { prompt, tracks } = await request.json()
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1000)
    return NextResponse.json({ error: 'Invalid prompt' }, { status: 400 })

  const library = Array.isArray(tracks)
    ? tracks
        .slice(0, 60)
        .map((t: any) => `- ${t.title} — ${t.artist} · ${t.bpm || '?'} BPM · ${t.musicalKey || '?'} key`)
        .join('\n')
    : ''

  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest'
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `User library:\n${library || 'No tracks loaded'}\n\nRequest: ${prompt}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
        }),
      }
    )
    const data: any = await res.json()
    if (!res.ok) {
      console.error('[assistant] gemini error:', data)
      return NextResponse.json({ error: data?.error?.message || 'Assistant failed' }, { status: 502 })
    }
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .filter(Boolean)
        .join('')
        .trim() || 'No response.'
    return NextResponse.json({ text })
  } catch (error) {
    console.error('[assistant] POST failed:', error)
    return NextResponse.json({ error: 'Assistant request failed' }, { status: 502 })
  }
}
