'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  Circle,
  Disc3,
  Download,
  LoaderCircle,
  Pause,
  Play,
  Repeat,
  Scissors,
  Square,
  Trash2,
} from 'lucide-react'
import type { Recording, Track } from '@/lib/types'

const fetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) {
    const body = await r.json().catch(() => null)
    throw new Error(body?.error || 'Request failed')
  }
  return r.json()
}
const fmt = (n: number) => `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, '0')}`

type Loop = { on: boolean; start: number; end: number }
const noLoop = (): Loop => ({ on: false, start: 0, end: 0 })

export function RemixStudio({ tracks }: { tracks: Track[] }) {
  const { data: recordings = [], error: recError, mutate: mutateRecs } = useSWR<Recording[]>('/api/recordings', fetcher)

  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')
  const [crossfade, setCrossfade] = useState(50)
  const [cutoff, setCutoff] = useState(20000)
  const [playing, setPlaying] = useState<{ a: boolean; b: boolean }>({ a: false, b: false })
  const [loopA, setLoopA] = useState<Loop>(noLoop())
  const [loopB, setLoopB] = useState<Loop>(noLoop())
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [mixTitle, setMixTitle] = useState('')
  const [status, setStatus] = useState('Pick two tracks, blend them with the crossfader and filter, then record to export your mashup.')
  const [statusKind, setStatusKind] = useState<'info' | 'error'>('info')

  const aEl = useRef<HTMLAudioElement | null>(null)
  const bEl = useRef<HTMLAudioElement | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const gainA = useRef<GainNode | null>(null)
  const gainB = useRef<GainNode | null>(null)
  const filterRef = useRef<BiquadFilterNode | null>(null)
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Loops are read inside audio timeupdate callbacks; refs avoid stale-closure loop points.
  const loopARef = useRef(loopA)
  const loopBRef = useRef(loopB)
  loopARef.current = loopA
  loopBRef.current = loopB
  // Read at save time so the latest title/elapsed are used when the recorder stops.
  const mixTitleRef = useRef(mixTitle)
  const elapsedRef = useRef(elapsed)
  const mimeTypeRef = useRef('')
  mixTitleRef.current = mixTitle
  elapsedRef.current = elapsed

  function say(message: string, kind: 'info' | 'error' = 'info') {
    setStatus(message)
    setStatusKind(kind)
  }

  function ensureGraph() {
    if (ctxRef.current || !aEl.current || !bEl.current) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx: AudioContext = new Ctx()
    const srcA = ctx.createMediaElementSource(aEl.current)
    const srcB = ctx.createMediaElementSource(bEl.current)
    const gA = ctx.createGain()
    const gB = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    const master = ctx.createGain()
    const dest = ctx.createMediaStreamDestination()
    srcA.connect(gA)
    srcB.connect(gB)
    gA.connect(filter)
    gB.connect(filter)
    filter.connect(master)
    master.connect(ctx.destination)
    master.connect(dest)
    ctxRef.current = ctx
    gainA.current = gA
    gainB.current = gB
    filterRef.current = filter
    destRef.current = dest
    applyCrossfade(crossfade)
  }

  function applyCrossfade(v: number) {
    const rad = (v / 100) * (Math.PI / 2)
    if (gainA.current) gainA.current.gain.value = Math.cos(rad)
    if (gainB.current) gainB.current.gain.value = Math.sin(rad)
  }

  useEffect(() => applyCrossfade(crossfade), [crossfade])
  useEffect(() => {
    if (filterRef.current) filterRef.current.frequency.value = cutoff
  }, [cutoff])
  // Tear down the timer, recorder, and audio graph when leaving the studio.
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current)
      const mr = recorderRef.current
      if (mr && mr.state !== 'inactive') {
        mr.onstop = null
        mr.stop()
      }
      ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
    },
    []
  )

  async function toggle(which: 'a' | 'b') {
    ensureGraph()
    const ctx = ctxRef.current
    if (ctx && ctx.state === 'suspended') await ctx.resume().catch(() => {})
    const el = which === 'a' ? aEl.current : bEl.current
    if (!el || !el.src) return
    if (el.paused) {
      try {
        await el.play()
      } catch {
        /* ignore autoplay errors */
      }
    } else {
      el.pause()
    }
  }

  function handleTime(which: 'a' | 'b') {
    const el = which === 'a' ? aEl.current : bEl.current
    const loop = which === 'a' ? loopARef.current : loopBRef.current
    if (el && loop.on && loop.end > loop.start && el.currentTime >= loop.end) el.currentTime = loop.start
  }

  function startRecording() {
    ensureGraph()
    const ctx = ctxRef.current
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
    if (!destRef.current) {
      say('Load and play a track first so there is audio to record.', 'error')
      return
    }
    chunksRef.current = []
    // Pick a MIME type the current browser supports (Safari prefers audio/mp4)
    const preferredMime = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ].find((t) => MediaRecorder.isTypeSupported(t)) || ''
    mimeTypeRef.current = preferredMime
    let mr: MediaRecorder
    try {
      mr = new MediaRecorder(destRef.current.stream, preferredMime ? { mimeType: preferredMime } : {})
    } catch {
      say('Recording is not supported in this browser.', 'error')
      return
    }
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    mr.start()
    recorderRef.current = mr
    setRecording(true)
    setElapsed(0)
    say('Recording the master output… play, blend and filter live.')
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
  }

  function stopRecording() {
    const mr = recorderRef.current
    if (mr && mr.state !== 'inactive') {
      // Attach onstop here so it closes over current state, not the state at record start.
      mr.onstop = () => saveRecording()
      mr.stop()
    }
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setRecording(false)
  }

  async function saveRecording() {
    setSaving(true)
    try {
      const mimeType = mimeTypeRef.current || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      chunksRef.current = []
      if (blob.size === 0) {
        say('Nothing was recorded — start playback before recording.', 'error')
        return
      }
      const form = new FormData()
      form.set('file', blob, 'mix.webm')
      form.set('title', mixTitleRef.current.trim() || `Mashup ${new Date().toLocaleString()}`)
      form.set('duration', String(elapsedRef.current))
      const res = await fetch('/api/recordings', { method: 'POST', body: form })
      if (res.ok) {
        setMixTitle('')
        say('Mix exported and saved to your Recordings library.')
        await mutateRecs()
      } else {
        const body = await res.json().catch(() => null)
        say(body?.error || 'Could not save the recording.', 'error')
      }
    } catch {
      say('Could not save the recording. Check your connection and try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecording(id: string) {
    if (!confirm('Delete this recording?')) return
    try {
      const res = await fetch(`/api/recordings?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        say(body?.error || 'Could not delete the recording.', 'error')
      }
    } catch {
      say('Could not delete the recording.', 'error')
    }
    await mutateRecs()
  }

  // Rendered as a plain function (not a nested component) so the <audio> elements
  // stay mounted across re-renders — a nested component type would remount them
  // on every crossfade/filter change and cut playback.
  function renderDeck(side: 'a' | 'b') {
    const id = side === 'a' ? aId : bId
    const setId = side === 'a' ? setAId : setBId
    const el = side === 'a' ? aEl : bEl
    const loop = side === 'a' ? loopA : loopB
    const setLoop = side === 'a' ? setLoopA : setLoopB
    const track = tracks.find((t) => t.id === id)
    return (
      <section className="remix-deck" data-testid={`remix-deck-${side}`} aria-label={`Remix deck ${side.toUpperCase()}`}>
        <header>
          <b className="deck-letter" aria-hidden="true">{side.toUpperCase()}</b>
          <select
            value={id}
            aria-label={`Deck ${side.toUpperCase()} track`}
            onChange={(e) => {
              // Pause and rewind the current element before switching tracks
              const current = el.current
              if (current) {
                current.pause()
                current.currentTime = 0
              }
              setId(e.target.value)
              setLoop(noLoop())
              setPlaying((p) => ({ ...p, [side]: false }))
            }}
            data-testid={`remix-select-${side}`}
          >
            <option value="">Select a track…</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} — {t.artist}
              </option>
            ))}
          </select>
        </header>
        <audio
          ref={el}
          src={id ? `/api/tracks/${id}/stream` : undefined}
          preload="metadata"
          onPlay={() => setPlaying((p) => ({ ...p, [side]: true }))}
          onPause={() => setPlaying((p) => ({ ...p, [side]: false }))}
          onEnded={() => setPlaying((p) => ({ ...p, [side]: false }))}
          onTimeUpdate={() => handleTime(side)}
        />
        <p className="remix-nowplaying">{track ? `${track.bpm?.toFixed(1) || '—'} BPM · ${track.musicalKey || 'KEY —'}` : 'No track loaded'}</p>
        <div className="remix-transport">
          <button
            type="button"
            className="transport play"
            disabled={!id}
            onClick={() => toggle(side)}
            aria-label={playing[side] ? `Pause deck ${side.toUpperCase()}` : `Play deck ${side.toUpperCase()}`}
            data-testid={`remix-play-${side}`}
          >
            {playing[side] ? <Pause /> : <Play />}
          </button>
          <button
            type="button"
            className="transport"
            disabled={!id}
            onClick={() => setLoop((l) => ({ ...l, start: el.current?.currentTime || 0 }))}
            aria-label={`Set loop in point on deck ${side.toUpperCase()}`}
            data-testid={`remix-cuein-${side}`}
          >
            IN {loop.start ? fmt(loop.start) : ''}
          </button>
          <button
            type="button"
            className="transport"
            disabled={!id}
            onClick={() => setLoop((l) => ({ ...l, end: el.current?.currentTime || 0 }))}
            aria-label={`Set loop out point on deck ${side.toUpperCase()}`}
            data-testid={`remix-cueout-${side}`}
          >
            OUT {loop.end ? fmt(loop.end) : ''}
          </button>
          <button
            type="button"
            className={`transport ${loop.on ? 'active' : ''}`}
            disabled={!id || loop.end <= loop.start}
            aria-pressed={loop.on}
            aria-label={`Toggle loop on deck ${side.toUpperCase()}`}
            onClick={() => setLoop((l) => ({ ...l, on: !l.on }))}
            data-testid={`remix-loop-${side}`}
          >
            <Repeat />
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="feature-panel" data-testid="remix-panel">
      <div className="feature-head">
        <p className="eyebrow">
          <Scissors aria-hidden="true" />
          REMIX STUDIO
        </p>
        <h1>Mashup &amp; record</h1>
        <p className="feature-sub">
          Layer two tracks with loops and a live filter, then capture the master output as an exportable mix.
        </p>
      </div>

      <div className="remix-decks">
        {renderDeck('a')}
        {renderDeck('b')}
      </div>

      <section className="remix-mixer" aria-label="Remix mixer">
        <label>
          CROSSFADER A ↔ B
          <input
            type="range"
            min="0"
            max="100"
            value={crossfade}
            aria-label="Remix crossfader"
            onChange={(e) => setCrossfade(Number(e.target.value))}
            data-testid="remix-crossfader"
          />
        </label>
        <label>
          LOW-PASS FILTER {cutoff >= 20000 ? 'OFF' : `${(cutoff / 1000).toFixed(1)}kHz`}
          <input
            type="range"
            min="200"
            max="20000"
            step="100"
            value={cutoff}
            aria-label="Low-pass filter cutoff"
            onChange={(e) => setCutoff(Number(e.target.value))}
            data-testid="remix-filter"
          />
        </label>
      </section>

      <section className="remix-record" aria-label="Record mix">
        <input
          value={mixTitle}
          onChange={(e) => setMixTitle(e.target.value)}
          placeholder="Name your mix"
          aria-label="Mix title"
          className="mix-title-input"
          data-testid="remix-title-input"
        />
        {recording ? (
          <button type="button" className="record-btn on" onClick={stopRecording} data-testid="remix-stop-button">
            <Square />
            Stop · {fmt(elapsed)}
          </button>
        ) : (
          <button type="button" className="record-btn" onClick={startRecording} disabled={saving} data-testid="remix-record-button">
            {saving ? <LoaderCircle className="spin" /> : <Circle />}
            {saving ? 'Saving…' : 'Record mix'}
          </button>
        )}
      </section>

      <p className={`status-line ${statusKind === 'error' ? 'error' : ''}`} role="status" data-testid="remix-status">
        {status}
      </p>

      <section className="recordings-list" aria-label="Recordings">
        <h2>
          <Disc3 aria-hidden="true" /> Recordings ({recordings.length})
        </h2>
        {recError ? (
          <p className="status-line error">Could not load recordings: {recError.message}</p>
        ) : recordings.length === 0 ? (
          <p className="muted">No mixes yet — record your first mashup above.</p>
        ) : (
          <div className="recordings-rows" data-testid="recordings-list">
            {recordings.map((r) => (
              <article key={r.id} data-testid={`recording-row-${r.id}`}>
                <div className="rec-meta">
                  <b>{r.title}</b>
                  <small>
                    {r.duration ? fmt(r.duration) : '—'} · {new Date(r.createdAt).toLocaleString()}
                  </small>
                </div>
                <audio controls preload="none" src={`/api/recordings/${r.id}/stream`} className="rec-audio" data-testid={`recording-audio-${r.id}`} />
                <div className="rec-actions">
                  <a
                    className="icon-button"
                    href={`/api/recordings/${r.id}/stream`}
                    download
                    data-testid={`download-recording-${r.id}`}
                    aria-label={`Download ${r.title}`}
                  >
                    <Download />
                  </a>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => deleteRecording(r.id)}
                    aria-label={`Delete ${r.title}`}
                    data-testid={`delete-recording-${r.id}`}
                  >
                    <Trash2 />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
