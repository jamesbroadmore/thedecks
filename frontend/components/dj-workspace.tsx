'use client'

import Image from 'next/image'
import useSWR from 'swr'
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  Bot,
  Compass,
  CloudUpload,
  Disc3,
  HardDrive,
  Library,
  LoaderCircle,
  LogOut,
  Pause,
  Play,
  Plus,
  Radio,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import type { Track } from '@/lib/types'
import { SourcesPanel } from '@/components/sources-panel'
import { DiscoverPanel } from '@/components/discover-panel'
import { RemixStudio } from '@/components/remix-studio'

type Deck = {
  track: Track | null
  playing: boolean
  current: number
  duration: number
  volume: number
  rate: number
  loopStart: number | null
  loopEnd: number | null
}

type View = 'perform' | 'sources' | 'discover' | 'remix'

const fetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) {
    const body = await r.json().catch(() => null)
    throw new Error(body?.error || 'Request failed')
  }
  return r.json()
}

const blank = (): Deck => ({
  track: null,
  playing: false,
  current: 0,
  duration: 0,
  volume: 0.8,
  rate: 1,
  loopStart: null,
  loopEnd: null,
})

const time = (n: number) =>
  `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, '0')}`

function Wave({ progress }: { progress: number }) {
  const bars = [28, 46, 64, 35, 72, 51, 82, 42, 69, 31, 57, 76, 43, 66, 38, 85, 53, 71, 47, 62, 33, 79, 55, 68, 41, 74, 49, 88, 37, 64, 52, 77, 45, 69, 34, 81, 58, 72, 40, 61]
  return (
    <div className="waveform" role="img" aria-label={`Playback progress ${Math.round(progress * 100)}%`}>
      {bars.map((h, i) => (
        <i key={i} style={{ height: `${h}%`, background: i / bars.length < progress ? 'var(--primary)' : undefined }} />
      ))}
      <span style={{ left: `${Math.min(100, progress * 100)}%` }} />
    </div>
  )
}

function DeckView({
  index,
  deck,
  audio,
  onDeck,
  onLoad,
  tracks,
}: {
  index: number
  deck: Deck
  audio: (el: HTMLAudioElement | null) => void
  onDeck: (patch: Partial<Deck>) => void
  onLoad: (t: Track) => void
  tracks: Track[]
}) {
  const letter = String.fromCharCode(65 + index)
  const elRef = useRef<HTMLAudioElement | null>(null)
  const loopRef = useRef<{ start: number | null; end: number | null }>({ start: deck.loopStart, end: deck.loopEnd })
  loopRef.current = { start: deck.loopStart, end: deck.loopEnd }
  const looping = deck.loopStart !== null && deck.loopEnd !== null

  async function toggle() {
    const el = elRef.current
    if (!el || !deck.track) return
    if (el.paused) {
      try {
        await el.play()
      } catch {
        /* play() can be interrupted by a new load — the pause event keeps state coherent */
      }
    } else {
      el.pause()
    }
  }

  return (
    <section className="panel deck-panel" aria-label={`Deck ${letter}`} data-testid={`deck-${letter.toLowerCase()}`}>
      <audio
        id={`deck-audio-${index}`}
        ref={(el) => {
          elRef.current = el
          audio(el)
        }}
        src={deck.track ? `/api/tracks/${deck.track.id}/stream` : undefined}
        preload="metadata"
        onPlay={() => onDeck({ playing: true })}
        onPause={() => onDeck({ playing: false })}
        onEnded={() => onDeck({ playing: false })}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget
          el.playbackRate = deck.rate
          onDeck({ duration: el.duration || 0 })
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget
          const { start, end } = loopRef.current
          if (start !== null && end !== null && end > start && el.currentTime >= end) el.currentTime = start
          onDeck({ current: el.currentTime, duration: el.duration || 0 })
        }}
      />
      <header>
        <b className="deck-letter" aria-hidden="true">{letter}</b>
        <div>
          <h2>{deck.track?.title || 'Empty deck'}</h2>
          <p>{deck.track?.artist || 'Load a track from your library'}</p>
        </div>
        <strong>
          {deck.track?.bpm?.toFixed(1) || '—'}
          <small>{deck.track?.musicalKey || 'KEY —'}</small>
        </strong>
      </header>
      <Wave progress={deck.duration ? deck.current / deck.duration : 0} />
      <input
        className="seek"
        aria-label={`Deck ${letter} position`}
        type="range"
        min="0"
        max={deck.duration || 1}
        step="0.1"
        value={Math.min(deck.current, deck.duration || 1)}
        disabled={!deck.track}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (elRef.current) elRef.current.currentTime = next
          onDeck({ current: next })
        }}
      />
      <div className="deck-time">
        <span>{time(deck.current)}</span>
        <span>-{time(Math.max(0, deck.duration - deck.current))}</span>
      </div>
      <div className="transport-row">
        <button
          type="button"
          className="transport"
          data-testid={`deck-${letter.toLowerCase()}-cue`}
          disabled={!deck.track}
          aria-label={`Deck ${letter} cue to start`}
          onClick={() => {
            if (elRef.current) elRef.current.currentTime = 0
            onDeck({ current: 0 })
          }}
        >
          CUE
        </button>
        <button
          type="button"
          className="transport play"
          data-testid={`deck-${letter.toLowerCase()}-play`}
          disabled={!deck.track}
          onClick={toggle}
          aria-label={deck.playing ? `Pause deck ${letter}` : `Play deck ${letter}`}
        >
          {deck.playing ? <Pause /> : <Play />}
        </button>
        <button
          type="button"
          className={`transport ${looping ? 'active' : ''}`}
          data-testid={`deck-${letter.toLowerCase()}-loop`}
          disabled={!deck.track}
          aria-pressed={looping}
          aria-label={looping ? `Deck ${letter} release 8-beat loop` : `Deck ${letter} set 8-second loop`}
          onClick={() =>
            looping
              ? onDeck({ loopStart: null, loopEnd: null })
              : onDeck({ loopStart: deck.current, loopEnd: Math.min(deck.duration || deck.current + 8, deck.current + 8) })
          }
        >
          LOOP
        </button>
        <label>
          SPEED {deck.rate !== 1 ? `${deck.rate > 1 ? '+' : ''}${Math.round((deck.rate - 1) * 100)}%` : ''}
          <input
            aria-label={`Deck ${letter} speed`}
            type="range"
            min="0.75"
            max="1.25"
            step="0.01"
            value={deck.rate}
            disabled={!deck.track}
            onChange={(e) => {
              const rate = Number(e.target.value)
              if (elRef.current) elRef.current.playbackRate = rate
              onDeck({ rate })
            }}
          />
        </label>
      </div>
      {!deck.track && tracks.length > 0 && (
        <button type="button" className="deck-load" data-testid={`deck-${letter.toLowerCase()}-quickload`} onClick={() => onLoad(tracks[0])}>
          Load first library track
        </button>
      )}
    </section>
  )
}

export function DJWorkspace({ user }: { user: { name: string; email: string } }) {
  const { data: tracks = [], error, isLoading, mutate } = useSWR<Track[]>('/api/tracks', fetcher)
  const [view, setView] = useState<View>('perform')
  const [decks, setDecks] = useState<Deck[]>([blank(), blank(), blank(), blank()])
  const [deckCount, setDeckCount] = useState<2 | 4>(2)
  const [mobileDeck, setMobileDeck] = useState(0)
  const [query, setQuery] = useState('')
  const [crossfade, setCrossfade] = useState(50)
  const [uploading, setUploading] = useState(false)
  const [libraryStatus, setLibraryStatus] = useState('')
  const [assistant, setAssistant] = useState('Ask for a transition, set-building, or harmonic-mixing recommendation.')
  const [asking, setAsking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([])

  const filtered = useMemo(
    () => tracks.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(query.trim().toLowerCase())),
    [tracks, query]
  )

  useEffect(() => {
    audioRefs.current.forEach((el, i) => {
      if (!el) return
      const side = i % 2 === 0 ? Math.min(1, (100 - crossfade) / 50) : Math.min(1, crossfade / 50)
      el.volume = Math.max(0, Math.min(1, decks[i].volume * side))
    })
  }, [crossfade, decks])

  function update(i: number, patch: Partial<Deck>) {
    setDecks((d) => d.map((x, j) => (i === j ? { ...x, ...patch } : x)))
  }
  function load(i: number, t: Track) {
    const el = audioRefs.current[i]
    if (el) {
      el.pause()
      el.currentTime = 0
      el.playbackRate = 1
    }
    setDecks((d) => d.map((x, j) => (i === j ? { ...blank(), track: t } : x)))
  }

  async function upload(file: File) {
    setUploading(true)
    setLibraryStatus('')
    try {
      const duration = await new Promise<number>((resolve) => {
        const a = document.createElement('audio')
        const url = URL.createObjectURL(file)
        const done = (n: number) => {
          URL.revokeObjectURL(url)
          resolve(n)
        }
        a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : 0)
        a.onerror = () => done(0)
        a.src = url
      })
      const base = file.name.replace(/\.[^.]+$/, '')
      const parts = base.split(' - ')
      const form = new FormData()
      form.set('file', file)
      form.set('title', parts.length > 1 ? parts.slice(1).join(' - ') : base)
      form.set('artist', parts.length > 1 ? parts[0] : 'Unknown Artist')
      form.set('duration', String(duration))
      const res = await fetch('/api/tracks', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Upload failed')
      }
      await mutate()
      setLibraryStatus(`Added “${parts.length > 1 ? parts.slice(1).join(' - ') : base}” to your library.`)
    } catch (e) {
      setLibraryStatus(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this track from your private library?')) return
    setLibraryStatus('')
    try {
      const res = await fetch(`/api/tracks?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Delete failed')
      }
      setDecks((d) =>
        d.map((x) => {
          if (x.track?.id !== id) return x
          const i = d.indexOf(x)
          const el = audioRefs.current[i]
          if (el) el.pause()
          return blank()
        })
      )
      await mutate()
    } catch (e) {
      setLibraryStatus(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function ask(prompt: string) {
    const clean = prompt.trim()
    if (!clean || asking) return
    setAsking(true)
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: clean, tracks }),
      })
      const json = await res.json().catch(() => null)
      setAssistant(json?.text || json?.error || 'The assistant could not answer that. Try again.')
    } catch {
      setAssistant('The assistant is unreachable right now. Check your connection and try again.')
    } finally {
      setAsking(false)
    }
  }

  const NAV: { id: View; label: string; icon: ComponentType }[] = [
    { id: 'perform', label: 'Perform', icon: Radio },
    { id: 'sources', label: 'Sources', icon: HardDrive },
    { id: 'discover', label: 'Discover', icon: Compass },
    { id: 'remix', label: 'Remix', icon: Scissors },
  ]

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Image src="/decks-4music2-mark.png" width={32} height={32} alt="4{music}2 brand mark" priority />
          </span>
          <div className="brand-lockup">
            <b>
              <em>the</em> decks
            </b>
            <small>
              BY <strong>4{'{'}MUSIC{'}'}2</strong>
            </small>
          </div>
        </div>
        <nav className="view-tabs" data-testid="view-tabs" aria-label="Workspace views">
          {NAV.map((n) => (
            <button
              type="button"
              key={n.id}
              className={view === n.id ? 'active' : ''}
              aria-current={view === n.id ? 'page' : undefined}
              onClick={() => setView(n.id)}
              data-testid={`view-tab-${n.id}`}
            >
              <n.icon />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span className="desktop-status" data-testid="track-count">
            {tracks.length} TRACKS
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={() => authClient.signOut().then(() => (location.href = '/sign-in'))}
            aria-label="Sign out"
            data-testid="sign-out-button"
          >
            <LogOut />
          </button>
        </div>
      </header>

      <nav className="mobile-nav" aria-label="Workspace views">
        {NAV.map((n) => (
          <button
            type="button"
            key={n.id}
            className={view === n.id ? 'active' : ''}
            aria-current={view === n.id ? 'page' : undefined}
            onClick={() => setView(n.id)}
            data-testid={`mobile-tab-${n.id}`}
          >
            <n.icon />
            {n.label}
          </button>
        ))}
      </nav>

      {/* PERFORM stays mounted so deck audio keeps playing when switching views */}
      <div className={view === 'perform' ? 'view-wrap' : 'view-hidden'} data-testid="view-perform">
        <section className={`performance-grid mode-${deckCount}`}>
          <div className="perform-toolbar">
            <div className="deck-toggle" role="group" aria-label="Deck layout">
              <button type="button" className={deckCount === 2 ? 'active' : ''} aria-pressed={deckCount === 2} onClick={() => setDeckCount(2)} data-testid="deck-mode-2">
                2 DECK
              </button>
              <button
                type="button"
                className={deckCount === 4 ? 'active' : ''}
                aria-pressed={deckCount === 4}
                onClick={() => setDeckCount(4)}
                data-testid="deck-mode-4"
              >
                4 DECK
              </button>
            </div>
            <div className="mobile-deck-tabs" role="group" aria-label="Visible deck">
              {Array.from({ length: deckCount }, (_, i) => (
                <button type="button" key={i} className={mobileDeck === i ? 'active' : ''} aria-pressed={mobileDeck === i} onClick={() => setMobileDeck(i)}>
                  DECK {String.fromCharCode(65 + i)}
                </button>
              ))}
            </div>
          </div>
          <div className="decks-grid">
            {decks.slice(0, deckCount).map((d, i) => (
              <div className={mobileDeck === i ? 'mobile-active' : ''} key={i}>
                <DeckView
                  index={i}
                  deck={d}
                  audio={(el) => (audioRefs.current[i] = el)}
                  onDeck={(patch) => update(i, patch)}
                  onLoad={(t) => load(i, t)}
                  tracks={tracks}
                />
              </div>
            ))}
          </div>
          <section className="panel mixer-panel" aria-label="Mixer">
            <header>
              <span>MIXER</span>
              <SlidersHorizontal aria-hidden="true" />
            </header>
            {decks.slice(0, deckCount).map((d, i) => (
              <label key={i}>
                DECK {String.fromCharCode(65 + i)}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={d.volume}
                  aria-label={`Deck ${String.fromCharCode(65 + i)} volume`}
                  onChange={(e) => update(i, { volume: Number(e.target.value) })}
                />
              </label>
            ))}
            <label>
              CROSSFADER
              <input
                type="range"
                min="0"
                max="100"
                value={crossfade}
                aria-label="Crossfader"
                onChange={(e) => setCrossfade(Number(e.target.value))}
                data-testid="crossfader"
              />
            </label>
          </section>
        </section>

        <section className="workspace-lower">
          <section className="library-panel" aria-label="Private library">
            <header className="library-header">
              <div>
                <p className="eyebrow">
                  <Library aria-hidden="true" />
                  PRIVATE LIBRARY
                </p>
                <h2>Your tracks</h2>
              </div>
              <label className="search">
                <Search aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your library"
                  aria-label="Search your library"
                  data-testid="library-search"
                />
              </label>
              <input
                ref={fileRef}
                hidden
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) upload(f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                className="primary-action"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                data-testid="upload-audio-button"
              >
                {uploading ? <LoaderCircle className="spin" /> : <CloudUpload />}
                {uploading ? 'Uploading' : 'Upload audio'}
              </button>
            </header>
            {libraryStatus && (
              <p className="status-line library-status" role="status" data-testid="library-status">
                {libraryStatus}
              </p>
            )}
            {isLoading ? (
              <div className="empty-state">
                <LoaderCircle className="spin" />
                <b>Loading your private library</b>
              </div>
            ) : error ? (
              <div className="empty-state">
                <b>Library unavailable</b>
                <p>{error.message}</p>
                <button type="button" className="ghost-action" onClick={() => mutate()}>
                  Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state" data-testid="library-empty">
                <Disc3 />
                <b>{tracks.length ? 'No matching tracks' : 'Your library is empty'}</b>
                <p>{tracks.length ? 'Try another search.' : 'Upload audio, add local sources, or import from the open catalog.'}</p>
                {tracks.length === 0 && (
                  <button type="button" className="primary-action" onClick={() => fileRef.current?.click()}>
                    <Plus />
                    Add your first track
                  </button>
                )}
              </div>
            ) : (
              <div className="real-track-list" data-testid="track-list">
                {filtered.map((t, i) => (
                  <article key={t.id} data-testid={`track-row-${t.id}`}>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <b>{t.title}</b>
                      <small>
                        {t.artist} · {time(t.duration || 0)}
                        {t.metadata?.source && t.metadata.source !== 'upload' ? ` · ${String(t.metadata.source).replace('_', ' ')}` : ''}
                      </small>
                    </div>
                    <span>{t.bpm?.toFixed(1) || '—'} BPM</span>
                    <span>{t.musicalKey || '—'}</span>
                    <div className="load-actions">
                      {Array.from({ length: deckCount }, (_, d) => (
                        <button
                          type="button"
                          key={d}
                          onClick={() => {
                            load(d, t)
                            setMobileDeck(d)
                            setView('perform')
                          }}
                          aria-label={`Load ${t.title} to Deck ${String.fromCharCode(65 + d)}`}
                          data-testid={`load-${t.id}-deck-${String.fromCharCode(65 + d)}`}
                        >
                          {String.fromCharCode(65 + d)}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="delete"
                        onClick={() => remove(t.id)}
                        aria-label={`Delete ${t.title}`}
                        data-testid={`delete-track-${t.id}`}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <aside className="ai-panel" aria-label="Performance assistant">
            <header>
              <span>
                <Bot aria-hidden="true" />
              </span>
              <div>
                <p>GEMINI PERFORMANCE ASSISTANT</p>
                <b>Grounded in your library</b>
              </div>
            </header>
            <div className="assistant-response" role="status" data-testid="assistant-response">
              <Sparkles aria-hidden="true" />
              <p>{assistant}</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                const prompt = String(f.get('prompt') || '')
                if (!prompt.trim()) return
                ask(prompt)
                e.currentTarget.reset()
              }}
            >
              <textarea name="prompt" placeholder="What should I play next?" required aria-label="Ask the assistant" data-testid="assistant-input" />
              <button className="primary-action" disabled={asking} data-testid="assistant-submit">
                {asking ? <LoaderCircle className="spin" /> : <Bot />}Ask Gemini
              </button>
            </form>
            <small>Recommendations use only your private library metadata. Audio is not sent to Gemini.</small>
          </aside>
        </section>
      </div>

      {view === 'sources' && (
        <div className="view-wrap" data-testid="view-sources">
          <SourcesPanel tracks={tracks} mutateTracks={mutate} />
        </div>
      )}
      {view === 'discover' && (
        <div className="view-wrap" data-testid="view-discover">
          <DiscoverPanel mutateTracks={mutate} />
        </div>
      )}
      {view === 'remix' && (
        <div className="view-wrap" data-testid="view-remix">
          <RemixStudio tracks={tracks} />
        </div>
      )}

      <footer>
        <span>
          WEB AUDIO <b>READY</b>
        </span>
        <span>
          STORAGE <b>PRIVATE</b>
        </span>
        <span className="ml-auto">
          SIGNED IN <b>{user.email}</b>
        </span>
      </footer>
    </main>
  )
}
